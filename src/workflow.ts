import { randomUUID } from 'node:crypto';
import type { CareStore, Identity } from './store.ts';
import type { DeviceEvent } from './domain.ts';
import { dayAt, demand, object, text } from './domain.ts';
import type { CarePlan, CareRun, CareAlert } from '../shared/protocol.ts';
import { missedCheckinQuestion, videoQuestion } from './questions.ts';

type Row = Record<string, any>;
const minute = 60000;
export const defaultPlan: CarePlan = { enabled: false, contextualEnabled: true, timeOfDay: '10:00', graceMinutes: 15, responseMinutes: 30, deferMinutes: 30 };
const formatters = new Map<string, Intl.DateTimeFormat>();
function wall(at: number, zone: string) {
  let fmt = formatters.get(zone);
  if (!fmt) { fmt = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); formatters.set(zone, fmt); }
  const p = Object.fromEntries(fmt.formatToParts(at).map(p => [p.type, p.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, clock: `${p.hour}:${p.minute}`, utc: Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) };
}
const dueCache = new Map<string, number>();
// Repeated DST times use the first occurrence; skipped times use the next existing local minute.
export function scheduledAt(now: number, clock: string, zone: string): number {
  const day = wall(now, zone).day, key = `${day}/${clock}/${zone}`;
  if (dueCache.has(key)) return dueCache.get(key)!;
  const approx = Date.parse(`${day}T${clock}:00Z`);
  const offsets = new Set([-86400000, 0, 86400000].map(d => wall(approx + d, zone).utc - (approx + d)));
  const candidates = [...offsets].map(offset => approx - offset).filter(t => { const p = wall(t, zone); return p.day === day && p.clock === clock; }).sort((a, b) => a - b);
  let result = candidates[0];
  if (result === undefined) {
    for (let t = approx - 16 * 3600000; t <= approx + 16 * 3600000; t += minute) {
      const p = wall(t, zone); if (p.day === day && p.clock >= clock) { result = t; break; }
    }
  }
  demand(result !== undefined, '這個時區今天沒有可用的關心時間');
  if (dueCache.size > 1000) dueCache.clear(); dueCache.set(key, result); return result;
}

export class CareWorkflow {
  constructor(privateStore: CareStore) {
    this.s = privateStore;
    this.s.db.exec(`
      CREATE TABLE IF NOT EXISTS care_plans(person_id TEXT PRIMARY KEY REFERENCES people(id),enabled INTEGER NOT NULL,time_of_day TEXT NOT NULL,grace INTEGER NOT NULL,response INTEGER NOT NULL,defer INTEGER NOT NULL,effective_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS care_runs(id TEXT PRIMARY KEY,person_id TEXT NOT NULL REFERENCES people(id),day TEXT NOT NULL,due_at INTEGER NOT NULL,deadline INTEGER,question_id TEXT,state TEXT NOT NULL,reason TEXT NOT NULL,UNIQUE(person_id,day));
      CREATE TABLE IF NOT EXISTS care_steps(id INTEGER PRIMARY KEY AUTOINCREMENT,run_id TEXT NOT NULL REFERENCES care_runs(id),at INTEGER NOT NULL,kind TEXT NOT NULL,detail TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS care_alerts(id TEXT PRIMARY KEY,source_key TEXT NOT NULL UNIQUE,person_id TEXT NOT NULL REFERENCES people(id),run_id TEXT,kind TEXT NOT NULL,created_at INTEGER NOT NULL,read_at INTEGER,resolved_at INTEGER,payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS care_alerts_person ON care_alerts(person_id,created_at);
      CREATE INDEX IF NOT EXISTS care_runs_person ON care_runs(person_id,due_at);
    `);
    if (!storeHasColumn(this.s, 'care_plans', 'contextual_enabled')) this.s.db.exec('ALTER TABLE care_plans ADD COLUMN contextual_enabled INTEGER NOT NULL DEFAULT 1');
    for (const p of this.s.all('SELECT * FROM people WHERE demo=0 AND help_id IS NOT NULL')) this.alert(p.id, `event:${p.help_id}`, 'help', '本人明確希望照顧者聯絡', undefined, undefined, p.help_at);
  }
  s: CareStore;
  plan(personId: string): CarePlan {
    const r = this.s.get('SELECT * FROM care_plans WHERE person_id=?', personId);
    return r ? { enabled: !!r.enabled, contextualEnabled: !!r.contextual_enabled, timeOfDay: r.time_of_day, graceMinutes: r.grace, responseMinutes: r.response, deferMinutes: r.defer } : { ...defaultPlan };
  }
  setPlan(identity: Identity, personId: string, value: unknown) {
    const p = this.s.person(identity, personId); demand(!p.demo, '示範對象不啟用自動關心');
    const b = object(value); demand(Object.keys(b).every(k => ['enabled', 'contextualEnabled', 'timeOfDay', 'graceMinutes', 'responseMinutes', 'deferMinutes'].includes(k)), '關心設定含有不支援的欄位');
    demand(typeof b.enabled === 'boolean', '請選擇是否啟用');
    demand(b.contextualEnabled === undefined || typeof b.contextualEnabled === 'boolean', '情境確認設定不正確');
    const clock = text(b.timeOfDay, '關心時間', 5); demand(/^([01]\d|2[0-3]):[0-5]\d$/.test(clock), '關心時間格式不正確');
    for (const key of ['graceMinutes', 'responseMinutes', 'deferMinutes']) demand(Number.isInteger(b[key]) && (b[key] as number) >= 1 && (b[key] as number) <= 240, '等待時間需為一至 240 分鐘');
    return this.s.transaction(() => {
      const old = this.plan(personId), contextual = b.contextualEnabled === undefined ? old.contextualEnabled : b.contextualEnabled;
      const same = JSON.stringify(old) === JSON.stringify({ enabled: b.enabled, contextualEnabled: contextual, timeOfDay: clock, graceMinutes: b.graceMinutes, responseMinutes: b.responseMinutes, deferMinutes: b.deferMinutes });
      if (same) return old;
      // Editing a schedule stops future automatic actions, but never dismisses an existing caregiver alert.
      for (const run of this.s.all("SELECT * FROM care_runs WHERE person_id=? AND state IN ('waiting','observing','question_pending','deferred')", personId)) {
        this.finish(run, 'cancelled', '關心時間已由照顧者修改');
      }
      this.s.run('INSERT INTO care_plans(person_id,enabled,time_of_day,grace,response,defer,effective_at,contextual_enabled) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(person_id) DO UPDATE SET enabled=excluded.enabled,time_of_day=excluded.time_of_day,grace=excluded.grace,response=excluded.response,defer=excluded.defer,effective_at=excluded.effective_at,contextual_enabled=excluded.contextual_enabled', personId, b.enabled ? 1 : 0, clock, b.graceMinutes as number, b.responseMinutes as number, b.deferMinutes as number, this.s.now(), contextual ? 1 : 0);
      return this.plan(personId);
    });
  }
  step(run: Row, kind: string, detail: string) { this.s.run('INSERT INTO care_steps(run_id,at,kind,detail) VALUES(?,?,?,?)', run.id, this.s.now(), kind, detail); }
  current(personId: string): Row | undefined { return this.s.get('SELECT * FROM care_runs WHERE person_id=? ORDER BY due_at DESC LIMIT 1', personId); }
  runView(personId: string): CareRun | null {
    const r = this.current(personId); if (!r) return null;
    return { id: r.id, day: r.day, dueAt: r.due_at, deadline: r.deadline, questionId: r.question_id, state: r.state, reason: r.reason,
      steps: this.s.all('SELECT at,kind,detail FROM care_steps WHERE run_id=? ORDER BY id', r.id) as CareRun['steps'] };
  }
  finish(run: Row, state: 'clarified' | 'resolved' | 'cancelled', reason: string) {
    this.s.run('UPDATE care_runs SET state=?,reason=?,deadline=NULL WHERE id=?', state, reason, run.id);
    if (run.question_id) {
      this.s.run("UPDATE questions SET status=? WHERE id=? AND status='open'", state === 'clarified' ? 'closed_by_checkin' : 'cancelled', run.question_id);
      this.s.run("UPDATE reminders SET result='cancelled',completed_at=? WHERE question_id=? AND result='pending'", this.s.now(), run.question_id);
    }
    if (state !== 'cancelled') this.s.run('UPDATE care_alerts SET resolved_at=? WHERE run_id=? AND resolved_at IS NULL', this.s.now(), run.id);
    this.step(run, state, reason);
  }
  evidence(personId: string): string[] {
    const p = this.s.get('SELECT p.*,w.timezone FROM people p JOIN workspaces w ON w.id=p.workspace_id WHERE p.id=?', personId)!;
    const stamp = (at: number) => new Intl.DateTimeFormat('zh-TW', { timeZone: p.timezone, dateStyle: 'short', timeStyle: 'short' }).format(at);
    const lines = [p.last_seen === null ? '尚未收到手機同步' : `最後收到手機資料：${stamp(p.last_seen)}`];
    if (p.context_json) {
      const c = JSON.parse(p.context_json);
      lines.push(`手機情境觀測：${stamp(p.context_at)}`);
      if (c.batteryPercent !== null) lines.push(`當時電量 ${c.batteryPercent}%${c.charging === true ? '，充電中' : c.charging === false ? '，未充電' : '，充電狀態未知'}`);
      lines.push(`取樣時網路：${c.network === 'online' ? '有經驗證連線' : c.network === 'offline' ? '沒有可用網路' : '未知'}`);
      const assessment = this.s.provider.assess(c, p.context_at, this.s.now());
      lines.push(...assessment.evidence.filter(e => !e.label.startsWith('電量')).map(e => `${e.label}（${stamp(e.observedAt)}）`), ...assessment.gaps.map(g => `資料缺口：${g}`));
    }
    return lines;
  }
  alert(personId: string, key: string, kind: 'help' | 'unclarified', title: string, run?: Row, question?: Row, sourceObservedAt?: number, extraEvidence: string[] = []) {
    const answer = question?.answer_json ? JSON.parse(question.answer_json) : null;
    const payload = { title, evidence: [...this.evidence(personId), ...extraEvidence, ...(sourceObservedAt === undefined ? [] : [`本人發出請求的時間：${new Date(sourceObservedAt).toISOString()}`])], question: question?.prompt || null, answer: answer ? answer.elseText || answer.label : null };
    this.s.run('INSERT OR IGNORE INTO care_alerts(id,source_key,person_id,run_id,kind,created_at,payload) VALUES(?,?,?,?,?,?,?)', randomUUID(), key, personId, run?.id || null, kind, this.s.now(), JSON.stringify(payload));
  }
  alerts(identity: Identity, personId?: string): CareAlert[] {
    if (personId) this.s.person(identity, personId);
    return this.s.all(`SELECT a.*,p.name FROM care_alerts a JOIN people p ON p.id=a.person_id WHERE p.workspace_id=? ${personId ? 'AND p.id=?' : ''} ORDER BY (a.resolved_at IS NULL) DESC,a.created_at DESC LIMIT 100`, identity.workspaceId, ...(personId ? [personId] : [])).map(a => ({ id: a.id, personId: a.person_id, personName: a.name, runId: a.run_id, kind: a.kind, createdAt: a.created_at, readAt: a.read_at, resolvedAt: a.resolved_at, ...JSON.parse(a.payload) }));
  }
  read(identity: Identity, alertId: string) {
    demand(this.s.get('SELECT a.id FROM care_alerts a JOIN people p ON p.id=a.person_id WHERE a.id=? AND p.workspace_id=?', alertId, identity.workspaceId), '找不到這則提醒', 404);
    this.s.run('UPDATE care_alerts SET read_at=COALESCE(read_at,?) WHERE id=?', this.s.now(), alertId); return { saved: true };
  }
  escalate(run: Row, reason: string) {
    const q = run.question_id ? this.s.get('SELECT * FROM questions WHERE id=?', run.question_id) : undefined;
    let delivery = '問題尚未由手機回報顯示結果';
    if (q) {
      const r = this.s.get('SELECT result FROM reminders WHERE question_id=? ORDER BY created_at DESC LIMIT 1', q.id);
      if (r?.result === 'executed') delivery = '手機已執行通知顯示流程，是否看到仍未知';
      else if (r?.result === 'declined') delivery = '手機回報無法顯示通知';
      if (q.answer_json) delivery = q.status === 'answered_late' ? '已收到延遲回答，仍需確認目前情況' : '本人已回答這題，原文附於提醒';
    }
    const full = `${reason}；${delivery}`;
    this.s.run("UPDATE care_runs SET state='escalated',reason=? WHERE id=?", full, run.id);
    this.alert(run.person_id, `run:${run.id}`, 'unclarified', full, run, q);
    if (run.question_id) this.s.run("UPDATE questions SET expires=MIN(expires,?) WHERE id=? AND status='open'", this.s.now(), run.question_id);
    this.step(run, 'escalated', full);
  }
  onEvent(personId: string, event: DeviceEvent, review?: string, reportsCheckin = false) {
    const run = this.current(personId);
    if (event.kind === 'help' || review === 'needs_contact') {
      this.alert(personId, `event:${event.eventId}`, 'help', '本人明確希望照顧者聯絡', undefined, event.questionId ? this.s.get('SELECT * FROM questions WHERE id=?', event.questionId) : undefined, event.observedAt);
      if (run && ['waiting', 'observing', 'question_pending', 'deferred', 'escalated'].includes(run.state)) this.finish(run, 'resolved', '本人已明確求助，改由求助待辦接手');
      return;
    }
    if (!run || !['waiting', 'observing', 'question_pending', 'deferred', 'escalated'].includes(run.state)) return;
    if ((event.kind === 'checkin' || reportsCheckin) && event.observedAt >= run.due_at - 120000 && this.s.now() - event.observedAt <= 120000) {
      const q = event.questionId ? this.s.get('SELECT answer_json FROM questions WHERE id=?', event.questionId) : null;
      this.finish(run, 'clarified', q?.answer_json ? `本人已確認：${JSON.parse(q.answer_json).label}` : '本人已回覆目前不需要協助'); return;
    }
    if (event.kind !== 'question_answer' || event.questionId !== run.question_id) return;
    const q = this.s.get('SELECT * FROM questions WHERE id=?', run.question_id)!;
    if (q.status === 'answered_late' || run.state === 'escalated') { this.step(run, 'late_answer', '已保留延遲答案，照顧者待辦繼續保留'); return; }
    if (review === 'deferred') {
      const deadline = this.s.now() + this.plan(personId).deferMinutes * minute;
      this.s.run("UPDATE care_runs SET state='deferred',deadline=?,reason=? WHERE id=?", deadline, '本人表示暫時不方便；延後等待直接報安，不重複提問', run.id);
      this.step(run, 'deferred', '本人選擇晚點回覆，已延長等待且不再問第二題');
    } else if (review === 'pending') this.escalate(run, '本人補充的情況仍需照顧者釐清');
  }
  tick() {
    this.s.transaction(() => {
      this.s.secretary.tick();
      for (const run of this.s.all("SELECT * FROM care_runs WHERE state IN ('waiting','observing','question_pending','deferred')")) {
        const plan = this.plan(run.person_id);
        if (!plan.enabled) { this.finish(run, 'cancelled', '自動關心已停用'); continue; }
        const p = this.s.get('SELECT * FROM people WHERE id=?', run.person_id)!;
        if ((run.state === 'waiting' && this.s.now() >= run.due_at + plan.graceMinutes * minute) || run.state === 'observing') {
          if (p.help_id) { this.finish(run, 'resolved', '已有本人求助，交由求助待辦處理'); continue; }
          const d = this.s.secretary.decision(p.id), video = plan.contextualEnabled && d.scenario === 'video' && d.action === 'wait' && d.validUntil > this.s.now();
          if (run.state === 'waiting' && video) {
            this.s.run("UPDATE care_runs SET state='observing',deadline=?,reason=? WHERE id=?", this.s.now() + 15 * minute, '可能正在看影片；先延後確認，尚未收到本人報安', run.id);
            this.step(run, 'video_wait', '前景影音 App 與播放線索持續一致，最多延後十五分鐘；不發出異常提醒'); continue;
          }
          if (run.state === 'observing' && this.s.now() < run.deadline) {
            const latest = this.s.secretary.samples(p.id).at(-1);
            const sourcesKnown = latest && this.s.now() - latest.at <= 120000 && latest.context.sources?.usage === 'available' && latest.context.sources.media === 'available';
            if (video || !sourcesKnown) continue;
          }
          const q = this.s.ask(p.id, run.state === 'observing' ? videoQuestion() : missedCheckinQuestion(), plan.responseMinutes * minute);
          this.s.run("UPDATE care_runs SET state='question_pending',question_id=?,deadline=?,reason=? WHERE id=?", q.id, q.expiresAt, '已提出一題，等待手機領取與本人回覆', run.id);
          this.s.run('INSERT INTO reminders(id,person_id,created_at,expires,question_id) SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM reminders WHERE question_id=?)', randomUUID(), p.id, this.s.now(), q.expiresAt, q.id, q.id);
          this.step(run, 'question_queued', run.state === 'observing' ? '影音線索改變或延後期限到達，現在詢問本人確認' : '到關心時間仍未報安，已排入一題與手機提醒');
        } else if (run.deadline !== null && this.s.now() >= run.deadline) this.escalate(run, run.state === 'deferred' ? '延後等待結束，仍未收到本人報安' : '回答等待時間結束，仍未釐清近況');
      }
      for (const p of this.s.all('SELECT p.*,w.timezone,c.* FROM people p JOIN workspaces w ON w.id=p.workspace_id JOIN care_plans c ON c.person_id=p.id WHERE c.enabled=1 AND p.demo=0')) {
        const due = scheduledAt(this.s.now(), p.time_of_day, p.timezone), day = dayAt(this.s.now(), p.timezone);
        if (this.s.now() < due || due < p.effective_at || this.s.get('SELECT id FROM care_runs WHERE person_id=? AND day=?', p.id, day)) continue;
        if (this.s.get("SELECT id FROM care_runs WHERE person_id=? AND state IN ('waiting','observing','question_pending','deferred','escalated')", p.id) || this.s.get("SELECT id FROM secretary_cases WHERE person_id=? AND state IN ('question_pending','deferred','escalated')", p.id)) continue;
        const satisfied = p.last_checkin !== null && dayAt(p.last_checkin, p.timezone) === day;
        const state = satisfied ? 'clarified' : p.help_id ? 'resolved' : 'waiting';
        const reason = satisfied ? '今天已收到本人報安' : p.help_id ? '已有本人求助，交由求助待辦處理' : '到預定關心時間，先等待寬限時間';
        const run = { id: randomUUID(), person_id: p.id };
        this.s.run('INSERT INTO care_runs(id,person_id,day,due_at,state,reason) VALUES(?,?,?,?,?,?)', run.id, p.id, day, due, state, reason);
        this.step(run, state, reason);
      }
    });
  }
}
function storeHasColumn(s: CareStore, table: string, column: string) { return s.all(`PRAGMA table_info(${table})`).some(c => c.name === column); }
