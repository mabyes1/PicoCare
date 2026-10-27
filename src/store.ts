import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { canonical, dayAt, demand, object, oneOf, parseEvent, text } from './domain.ts';
import type { Context, DeviceEvent } from './domain.ts';
import { LocalContextProvider, metaIntegration } from './assessment.ts';
import { ELSE_ID, MAX_ELSE_LENGTH, localQuestion } from './questions.ts';
import type { QuestionDraft, QuestionOption } from './questions.ts';
import type { QuestionRecord } from '../shared/protocol.ts';
import { CareWorkflow } from './workflow.ts';
import { Secretary } from './secretary.ts';

type Row = Record<string, any>;
export type Identity = { workspaceId: string; label: string; caregiverName: string; kind: 'personal' | 'institution'; timezone: string };
const secret = () => randomBytes(32).toString('base64url');
const id = () => randomUUID();

export class CareStore {
  db: DatabaseSync;
  now: () => number;
  provider = new LocalContextProvider();
  flow: CareWorkflow;
  secretary: Secretary;
  constructor(path: string, now: () => number = Date.now) {
    this.now = now;
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY,label TEXT NOT NULL,kind TEXT NOT NULL,caregiver_name TEXT NOT NULL,timezone TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id),expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS people(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id),name TEXT NOT NULL,
        device_token TEXT UNIQUE NOT NULL,demo INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 0,
        context_json TEXT,context_at INTEGER,last_seen INTEGER,last_checkin INTEGER,help_id TEXT,help_at INTEGER);
      CREATE TABLE IF NOT EXISTS pairings(code TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id),name TEXT NOT NULL,
        expires INTEGER NOT NULL,request_id TEXT,person_id TEXT REFERENCES people(id));
      CREATE TABLE IF NOT EXISTS events(person_id TEXT NOT NULL REFERENCES people(id),event_id TEXT NOT NULL,kind TEXT NOT NULL,
        observed_at INTEGER NOT NULL,received_at INTEGER NOT NULL,body TEXT NOT NULL,receipt_id TEXT NOT NULL UNIQUE,
        PRIMARY KEY(person_id,event_id));
      CREATE TABLE IF NOT EXISTS reminders(id TEXT PRIMARY KEY,person_id TEXT NOT NULL REFERENCES people(id),created_at INTEGER NOT NULL,
        expires INTEGER NOT NULL,result TEXT NOT NULL DEFAULT 'pending',completed_at INTEGER);
      CREATE TABLE IF NOT EXISTS contacts(id TEXT PRIMARY KEY,person_id TEXT NOT NULL REFERENCES people(id),at INTEGER NOT NULL,
        outcome TEXT NOT NULL,note TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS questions(id TEXT PRIMARY KEY,person_id TEXT NOT NULL REFERENCES people(id),prompt TEXT NOT NULL,
        options_json TEXT NOT NULL,created_at INTEGER NOT NULL,expires INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'open',answer_json TEXT);
      CREATE INDEX IF NOT EXISTS questions_person ON questions(person_id,created_at);
      CREATE INDEX IF NOT EXISTS people_workspace ON people(workspace_id);
      CREATE INDEX IF NOT EXISTS events_person_time ON events(person_id,received_at);
      CREATE TABLE IF NOT EXISTS self_enrollments(request_id TEXT PRIMARY KEY,person_id TEXT NOT NULL REFERENCES people(id),display_name TEXT NOT NULL);
    `);
    if (!this.all('PRAGMA table_info(reminders)').some(c => c.name === 'question_id')) this.db.exec('ALTER TABLE reminders ADD COLUMN question_id TEXT');
    if (!this.all('PRAGMA table_info(questions)').some(c => c.name === 'topic')) this.db.exec("ALTER TABLE questions ADD COLUMN topic TEXT NOT NULL DEFAULT 'checkin'");
    if (!this.all('PRAGMA table_info(people)').some(c => c.name === 'enrollment_mode')) this.db.exec("ALTER TABLE people ADD COLUMN enrollment_mode TEXT NOT NULL DEFAULT 'paired'");
    this.flow = new CareWorkflow(this);
    this.secretary = new Secretary(this);
  }
  get(sql: string, ...values: (string | number | null)[]): Row | undefined { return this.db.prepare(sql).get(...values) as Row | undefined; }
  all(sql: string, ...values: (string | number | null)[]): Row[] { return this.db.prepare(sql).all(...values) as Row[]; }
  run(sql: string, ...values: (string | number | null)[]): void { this.db.prepare(sql).run(...values); }
  transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = work(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close(): void { this.db.close(); }
  createWorkspace(value: unknown): { identity: Identity; session: string } {
    const b = object(value), label = text(b.label, '空間名稱', 60), caregiverName = text(b.caregiverName, '照顧者名稱', 40);
    const kind = oneOf(b.kind, ['personal', 'institution'], '使用方式');
    const timezone = b.timezone === undefined ? 'Asia/Taipei' : text(b.timezone, '時區', 80);
    try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); } catch { demand(false, '時區格式不正確'); }
    const workspaceId = id(), session = secret();
    this.transaction(() => {
      this.run('INSERT INTO workspaces VALUES(?,?,?,?,?)', workspaceId, label, kind, caregiverName, timezone);
      this.run('INSERT INTO sessions VALUES(?,?,?)', session, workspaceId, this.now() + 86400000);
    });
    return { identity: { workspaceId, label, kind, caregiverName, timezone }, session };
  }
  identity(session: string | undefined): Identity {
    const row = session && this.get('SELECT w.* FROM workspaces w JOIN sessions s ON s.workspace_id=w.id WHERE s.token=? AND s.expires>?', session, this.now());
    demand(row, '請先建立或登入照顧空間', 401);
    return { workspaceId: row.id, label: row.label, kind: row.kind, caregiverName: row.caregiver_name, timezone: row.timezone };
  }
  createPairing(identity: Identity, value: unknown) {
    const name = text(object(value).displayName, '被照顧者稱呼', 40);
    const code = randomBytes(6).toString('hex').toUpperCase();
    const expiresAt = this.now() + 600000;
    this.run('INSERT INTO pairings(code,workspace_id,name,expires) VALUES(?,?,?,?)', code, identity.workspaceId, name, expiresAt);
    return { code, expiresAt, displayName: name };
  }
  enroll(value: unknown) {
    const b = object(value), code = text(b.code, '配對碼', 20).replaceAll('-', '').toUpperCase(), requestId = text(b.requestId, '配對請求', 80);
    return this.transaction(() => {
      const pairing = this.get('SELECT * FROM pairings WHERE code=?', code);
      demand(pairing && pairing.expires > this.now(), '配對碼不存在或已過期', 404);
      if (pairing.person_id) demand(pairing.request_id === requestId, '配對碼已被使用', 409);
      else {
        const personId = id();
        this.run('INSERT INTO people(id,workspace_id,name,device_token) VALUES(?,?,?,?)', personId, pairing.workspace_id, pairing.name, secret());
        this.run('UPDATE pairings SET person_id=?,request_id=? WHERE code=?', personId, requestId, code);
        pairing.person_id = personId;
      }
      const person = this.get('SELECT * FROM people WHERE id=?', pairing.person_id)!;
      const workspace = this.get('SELECT label FROM workspaces WHERE id=?', pairing.workspace_id)!;
      return { personId: person.id, personName: person.name, workspaceLabel: workspace.label, deviceToken: person.device_token };
    });
  }
  selfEnroll(value: unknown) {
    const b = object(value), name = text(b.displayName, '你的稱呼', 40), requestId = text(b.requestId, '開始使用的請求', 80);
    demand(Object.keys(b).every(k => ['displayName', 'requestId'].includes(k)), '開始使用含有不支援欄位');
    demand(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId), '請求代碼需要隨機 UUID');
    return this.transaction(() => {
      const existing = this.get('SELECT * FROM self_enrollments WHERE request_id=?', requestId);
      if (existing) demand(existing.display_name === name, '開始使用的請求內容不同', 409);
      const personId = existing?.person_id || id();
      if (!existing) {
        const workspaceId = id();
        this.run('INSERT INTO workspaces VALUES(?,?,?,?,?)', workspaceId, `${name}的照護秘書`, 'personal', '本人實測（尚未配對照顧者）', 'Asia/Taipei');
        this.run("INSERT INTO people(id,workspace_id,name,device_token,enrollment_mode) VALUES(?,?,?,?,'self')", personId, workspaceId, name, secret());
        this.run('INSERT INTO self_enrollments VALUES(?,?,?)', requestId, personId, name);
      }
      const p = this.get('SELECT p.*,w.label FROM people p JOIN workspaces w ON w.id=p.workspace_id WHERE p.id=?', personId)!;
      return { personId: p.id, personName: p.name, workspaceLabel: p.label, deviceToken: p.device_token, enrollmentMode: 'self', caregiverConnected: false };
    });
  }
  selfPlan(token: string | undefined, value: unknown) {
    const p = this.device(token); demand(p.enrollment_mode === 'self', '這個入口供本人秘書使用', 403);
    const w = this.get('SELECT * FROM workspaces WHERE id=?', p.workspace_id)!;
    return this.flow.setPlan({ workspaceId: w.id, label: w.label, caregiverName: w.caregiver_name, kind: w.kind, timezone: w.timezone }, p.id, value);
  }
  device(token: string | undefined): Row {
    const person = token && this.get('SELECT * FROM people WHERE device_token=?', token);
    demand(person && !person.demo, '手機配對憑證無效', 401); return person;
  }
  person(identity: Identity, personId: string): Row {
    const person = this.get('SELECT * FROM people WHERE id=? AND workspace_id=?', personId, identity.workspaceId);
    demand(person, '找不到這位關懷對象', 404); return person;
  }
  ingest(token: string | undefined, value: unknown) {
    const person = this.device(token), event = parseEvent(value, this.now());
    return this.applyEvent(person.id, event);
  }
  // Only trusted question planning calls this; there is no device question/chat endpoint.
  ask(personId: string, draft: QuestionDraft, duration = 1800000) {
    demand(Number.isSafeInteger(duration) && duration >= 60000 && duration <= 14400000, '問題有效時間不正確');
    const prompt = text(draft.prompt, '問題', 160);
    demand(Array.isArray(draft.options) && draft.options.length >= 2 && draft.options.length <= 3, '每題需要二至三個選項');
    const options = draft.options.map(option => {
      const optionId = text(option.id, '選項代碼', 40);
      demand(optionId !== ELSE_ID, '保留的補充選項不可覆寫');
      return { id: optionId, label: text(option.label, '選項文字', 60), intent: oneOf(option.intent, ['report_ok', 'clarify', 'needs_contact', 'defer'], '答案意義') };
    });
    demand(new Set(options.map(o => o.id)).size === options.length && new Set(options.map(o => o.label)).size === options.length, '選項不可重複');
    demand(this.get('SELECT id FROM people WHERE id=?', personId), '找不到這位關懷對象', 404);
    const existing = this.get("SELECT * FROM questions WHERE person_id=? AND status='open' AND expires>? ORDER BY created_at DESC LIMIT 1", personId, this.now());
    if (existing) return this.questionView(existing);
    const questionId = id();
    this.run('INSERT INTO questions(id,person_id,prompt,options_json,created_at,expires,topic) VALUES(?,?,?,?,?,?,?)', questionId, personId, prompt, JSON.stringify(options), this.now(), this.now() + duration, oneOf(draft.topic || 'checkin', ['checkin', 'video', 'outing'], '問題主題'));
    return this.questionView(this.get('SELECT * FROM questions WHERE id=?', questionId)!);
  }
  questionView(row: Row): QuestionRecord {
    const options = JSON.parse(row.options_json) as QuestionOption[];
    return { id: row.id, topic: row.topic, prompt: row.prompt, options: options.map(({ id, label }) => ({ id, label })),
      elseLabel: '以上都不符合', maxElseLength: MAX_ELSE_LENGTH, createdAt: row.created_at, expiresAt: row.expires,
      source: 'rules', status: row.status === 'open' && row.expires <= this.now() ? 'expired' : row.status,
      answer: row.answer_json ? JSON.parse(row.answer_json) : null };
  }
  private recordCheckin(personId: string, observedAt: number) {
    this.run('UPDATE people SET last_checkin=? WHERE id=? AND (last_checkin IS NULL OR last_checkin<?)', observedAt, personId, observedAt);
    const cancelBefore = this.now() - observedAt <= 120000 ? observedAt + 120000 : observedAt;
    this.run("UPDATE reminders SET result='cancelled',completed_at=? WHERE person_id=? AND result='pending' AND created_at<=?", this.now(), personId, cancelBefore);
    this.run("UPDATE questions SET status='closed_by_checkin' WHERE person_id=? AND status='open' AND created_at<=?", personId, cancelBefore);
  }
  applyEvent(personId: string, event: DeviceEvent) {
    const serialized = canonical(event);
    return this.transaction(() => {
      const previous = this.get('SELECT * FROM events WHERE person_id=? AND event_id=?', personId, event.eventId);
      if (previous) {
        demand(previous.body === serialized, '同一事件代碼的內容不同', 409);
        return { receiptId: previous.receipt_id, eventId: event.eventId, status: 'recorded', receivedAt: previous.received_at as number, duplicate: true };
      }
      if (event.kind === 'reminder_result') {
        const reminder = this.get('SELECT * FROM reminders WHERE id=? AND person_id=?', event.reminderId!, personId);
        demand(reminder, '提醒不屬於這支手機', 404);
        if (reminder.result === 'pending') {
          const result = event.observedAt >= reminder.expires ? 'expired' : event.result!;
          this.run('UPDATE reminders SET result=?,completed_at=? WHERE id=?', result, this.now(), reminder.id);
        }
      }
      let answerReview: string | undefined;
      let reportsCheckin = false;
      if (event.kind === 'question_answer') {
        const question = this.get('SELECT * FROM questions WHERE id=? AND person_id=?', event.questionId!, personId);
        demand(question, '問題不屬於這支手機', 404);
        demand(question.answer_json === null, '這一題已經收到回答', 409);
        demand(event.observedAt >= question.created_at - 120000, '回答時間早於問題');
        const options = JSON.parse(question.options_json) as QuestionOption[];
        const option = options.find(o => o.id === event.optionId);
        demand(event.optionId === ELSE_ID || option, '請選擇這一題提供的答案');
        const late = question.status !== 'open' || this.now() >= question.expires || event.observedAt >= question.expires;
        const review = event.optionId === ELSE_ID ? 'pending' : option!.intent === 'needs_contact' ? 'needs_contact' : late ? 'pending' : ['report_ok', 'clarify'].includes(option!.intent) ? 'clarified' : 'deferred';
        answerReview = review;
        reportsCheckin = review === 'clarified' && option?.intent === 'report_ok';
        const answer = { optionId: event.optionId, label: option?.label || '以上都不符合',
          ...(event.elseText === undefined ? {} : { elseText: event.elseText }), observedAt: event.observedAt, review };
        this.run('UPDATE questions SET status=?,answer_json=? WHERE id=?', late ? 'answered_late' : 'answered', JSON.stringify(answer), question.id);
        this.run("UPDATE reminders SET result='cancelled',completed_at=? WHERE question_id=? AND result='pending'", this.now(), question.id);
        if (reportsCheckin) this.recordCheckin(personId, event.observedAt);
        // An explicit request for contact is delivered even if an offline answer arrives late.
        if (review === 'needs_contact') this.run('UPDATE people SET help_id=?,help_at=? WHERE id=?', event.eventId, event.observedAt, personId);
      }
      const receiptId = id();
      this.run('INSERT INTO events VALUES(?,?,?,?,?,?,?)', personId, event.eventId, event.kind, event.observedAt, this.now(), serialized, receiptId);
      this.run('UPDATE people SET last_seen=?,revision=revision+1 WHERE id=?', this.now(), personId);
      if (event.kind === 'context') this.run('UPDATE people SET context_json=?,context_at=? WHERE id=? AND (context_at IS NULL OR context_at<?)', JSON.stringify(event.context), event.observedAt, personId, event.observedAt);
      if (event.kind === 'checkin') {
        this.recordCheckin(personId, event.observedAt);
      }
      if (event.kind === 'help') this.run('UPDATE people SET help_id=?,help_at=? WHERE id=?', event.eventId, event.observedAt, personId);
      this.flow.onEvent(personId, event, answerReview, reportsCheckin);
      this.secretary.onEvent(personId, event, answerReview);
      return { receiptId, eventId: event.eventId, status: 'recorded', receivedAt: this.now(), duplicate: false };
    });
  }
  projection(person: Row, timezone: string) {
    const now = this.now(), context: Context | null = person.context_json ? JSON.parse(person.context_json) : null;
    let assessment = this.provider.assess(context, person.context_at, now);
    const secretary = this.secretary.view(person.id), d = secretary.decision;
    if (d.action !== 'none' && d.validUntil > now) assessment = { ...assessment, title: d.title, explanation: d.reason,
      evidence: [...d.evidence.map(e => ({ label: e.label, observedAt: e.observedAt })), ...assessment.evidence], gaps: d.gaps,
      nextAction: d.action === 'wait' ? '先延後確認；播放線索改變或等待期限到達後，再問本人' : '已優先向本人確認，查看原始回答與外出確認進度' };
    if (secretary.confirmation && secretary.confirmation.observedAt >= d.at && now - secretary.confirmation.observedAt <= 1800000) assessment = { ...assessment,
      title: '本人已確認這一題的近況', explanation: secretary.confirmation.text, nextAction: '保留本人原話；後續依新的證據與求助處理' };
    const checkin = person.last_checkin && dayAt(person.last_checkin, timezone) === dayAt(now, timezone) ? 'reported' : 'awaiting';
    return { id: person.id, name: person.name, demo: !!person.demo, revision: person.revision,
      lastSeen: person.last_seen, observedAt: person.context_at, lastCheckin: person.last_checkin,
      checkin, helpOpen: !!person.help_id, helpEventId: person.help_id, helpAt: person.help_at,
      connection: person.last_seen === null ? 'waiting' : now - person.last_seen > 120000 ? 'stale' : 'recent',
      facts: context, assessment, care: this.flow.runView(person.id), secretary };
  }
  list(identity: Identity) {
    return { workspace: identity, meta: metaIntegration, serverAt: this.now(),
      people: this.all('SELECT * FROM people WHERE workspace_id=? ORDER BY help_at DESC,name', identity.workspaceId).map(p => this.projection(p, identity.timezone)), alerts: this.flow.alerts(identity) };
  }
  detail(identity: Identity, personId: string) {
    const p = this.person(identity, personId);
    const events = this.all("SELECT kind,observed_at,received_at,event_id FROM events WHERE person_id=? AND kind<>'context' ORDER BY received_at DESC LIMIT 30", personId)
      .map(e => ({ kind: e.kind, at: e.observed_at, receivedAt: e.received_at, id: e.event_id }));
    const contacts = this.all('SELECT * FROM contacts WHERE person_id=? ORDER BY at DESC LIMIT 20', personId)
      .map(c => ({ kind: 'contact', at: c.at, outcome: c.outcome, note: c.note, id: c.id }));
    const reminders = this.all('SELECT id,created_at,expires,result FROM reminders WHERE person_id=? ORDER BY created_at DESC LIMIT 10', personId)
      .map(r => ({ id: r.id, createdAt: r.created_at, expiresAt: r.expires, result: r.result === 'pending' && r.expires <= this.now() ? 'expired' : r.result }));
    const questions = this.all('SELECT * FROM questions WHERE person_id=? ORDER BY created_at DESC LIMIT 10', personId).map(q => this.questionView(q));
    return { person: this.projection(p, identity.timezone), timeline: [...events, ...contacts].sort((a, b) => b.at - a.at), reminders, questions,
      plan: this.flow.plan(personId), care: this.flow.runView(personId), alerts: this.flow.alerts(identity, personId) };
  }
  requestCheckin(identity: Identity, personId: string) {
    const p = this.person(identity, personId);
    demand(!p.demo, '示範對象無法接收手機提醒');
    const existing = this.get("SELECT * FROM reminders WHERE person_id=? AND result='pending' AND expires>?", personId, this.now());
    if (existing) return { id: existing.id, status: 'pending', duplicate: true };
    return this.transaction(() => {
      const reminderId = id();
      const q = this.ask(personId, localQuestion(p.context_json ? JSON.parse(p.context_json) : null, p.context_at, this.now()));
      this.run('INSERT INTO reminders(id,person_id,created_at,expires,question_id) VALUES(?,?,?,?,?)', reminderId, personId, this.now(), q.expiresAt, q.id);
      return { id: reminderId, status: 'pending', duplicate: false };
    });
  }
  contact(identity: Identity, personId: string, value: unknown) {
    const b = object(value), outcome = oneOf(b.outcome, ['contacted', 'no_answer', 'help_resolved', 'care_resolved'], '聯絡結果');
    const note = b.note === '' || b.note === undefined ? '' : text(b.note, '備註', 300);
    return this.transaction(() => {
      const p = this.person(identity, personId);
      if (outcome === 'help_resolved') {
        demand(Number.isInteger(b.revision) && p.revision === b.revision && p.help_id && p.help_id === b.helpEventId, '求助已有更新，請重新查看再完成處理', 409);
        this.run('UPDATE people SET help_id=NULL,help_at=NULL WHERE id=?', personId);
        this.run("UPDATE care_alerts SET resolved_at=? WHERE person_id=? AND kind='help' AND resolved_at IS NULL", this.now(), personId);
      }
      if (outcome === 'care_resolved') {
        const run = this.flow.current(personId);
        demand(run && b.runId === run.id && ['waiting', 'observing', 'question_pending', 'deferred', 'escalated'].includes(run.state), '這件關心事項已有更新，請重新查看', 409);
        this.flow.finish(run, 'resolved', note || '照顧者已聯絡並確認近況');
      }
      this.run('INSERT INTO contacts VALUES(?,?,?,?,?)', id(), personId, this.now(), outcome, note);
      this.run('UPDATE people SET revision=revision+1 WHERE id=?', personId);
      return { saved: true };
    });
  }
  deviceStatus(token: string | undefined) {
    const person = this.device(token);
    const timezone = this.get('SELECT timezone FROM workspaces WHERE id=?', person.workspace_id)!.timezone;
    const projection = this.projection(person, timezone);
    const pending = this.all("SELECT id,created_at,expires FROM reminders WHERE person_id=? AND result='pending' AND expires>? ORDER BY created_at", person.id, this.now());
    const openQuestion = this.get("SELECT * FROM questions WHERE person_id=? AND status='open' AND expires>? ORDER BY created_at DESC LIMIT 1", person.id, this.now());
    return { personName: person.name, checkin: projection.checkin, helpOpen: projection.helpOpen, lastCheckin: person.last_checkin,
      lastSeen: person.last_seen, meta: metaIntegration, serverAt: this.now(), enrollmentMode: person.enrollment_mode,
      caregiverConnected: person.enrollment_mode !== 'self',
      assessment: projection.assessment, secretary: projection.secretary, observedAt: person.context_at, plan: this.flow.plan(person.id),
      question: openQuestion ? this.questionView(openQuestion) : null,
      reminders: pending.map(r => ({ id: r.id, createdAt: r.created_at, expiresAt: r.expires })) };
  }
  seedDemo(identity: Identity) {
    if (this.get('SELECT id FROM people WHERE workspace_id=? AND demo=1', identity.workspaceId)) return { created: false };
    const now = this.now();
    const base: Context = { batteryPercent: 78, charging: true, network: 'online', screenInteractive: true,
      ringer: 'normal', motion: 'unknown', location: null, notifications: [], sharing: 'summary' };
    this.transaction(() => {
      for (const [index, name] of ['林阿姨', '陳伯伯', '張奶奶'].entries()) {
        const personId = id(), observedAt = now - (index === 2 ? 600000 : 20000);
        const c: Context = index === 1 ? { ...base, charging: false, screenInteractive: false, motion: 'moving', notifications: [{ category: 'navigation', observedAt }] } : index === 2 ? { ...base, batteryPercent: 9, charging: false } : base;
        this.run('INSERT INTO people(id,workspace_id,name,device_token,demo,revision,context_json,context_at,last_seen,last_checkin,help_id,help_at) VALUES(?,?,?,?,1,1,?,?,?,?,?,?)',
          personId, identity.workspaceId, name, secret(), JSON.stringify(c), observedAt, observedAt, index === 0 ? now - 300000 : null, index === 2 ? id() : null, index === 2 ? now - 120000 : null);
      }
    });
    return { created: true };
  }
}
