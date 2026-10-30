import { randomUUID } from 'node:crypto';
import type { CareStore, Identity } from './store.ts';
import type { DeviceEvent } from './domain.ts';
import { dayAt, demand, object } from './domain.ts';
import type { CarePlan, CareRun, CareAlert } from '../shared/protocol.ts';
import { evidenceLabelEn } from './assessment.ts';
import type { Lang } from './lang.ts';
import { missedCheckinQuestion, videoQuestion } from './questions.ts';
export const HELP_TITLE: Record<Lang, string> = { zh: '本人明確希望照顧者聯絡', en: 'The person explicitly asked the caregiver to make contact' };

type Row = Record<string, any>;
const minute = 60000;
export const defaultPlan: CarePlan = { enabled: false, contextualEnabled: true, graceMinutes: 15, responseMinutes: 30, deferMinutes: 30, cooldownMinutes: 480 };
// Asking window in the person's workspace timezone: floating daytime greeting,
// evening fallback so a quiet day still gets one touch, never in deep night.
const askStart = '07:00', askEnd = '22:00', fallbackAt = '20:00';
const formatters = new Map<string, Intl.DateTimeFormat>();
function wall(at: number, zone: string) {
  let fmt = formatters.get(zone);
  if (!fmt) { fmt = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); formatters.set(zone, fmt); }
  const p = Object.fromEntries(fmt.formatToParts(at).map(p => [p.type, p.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, clock: `${p.hour}:${p.minute}` };
}

// zh-TW short stamp ("2026/10/29 晚上9:25") → en-US short ("10/29/26, 9:25 PM").
// Unknown shapes pass through untouched.
export function zhStampEn(value: string): string {
  const m = value.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2}) (凌晨|上午|中午|下午|晚上)(\d{1,2}):(\d{2})$/);
  if (!m) return value;
  const [, y, mo, d, part, h, mi] = m;
  let hour = Number(h);
  if (part === '凌晨') hour = hour % 12;
  else if (part === '上午' || part === '中午') hour = hour === 12 ? (part === '上午' ? 0 : 12) : hour;
  else hour = hour === 12 ? 12 : (hour % 12) + 12;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${mo}/${d}/${String(y).slice(2)}, ${h12}:${mi} ${suffix}`;
}

export class CareWorkflow {
  constructor(privateStore: CareStore) {
    this.s = privateStore;
    this.s.db.exec(`
      CREATE TABLE IF NOT EXISTS care_plans(person_id TEXT PRIMARY KEY REFERENCES people(id),enabled INTEGER NOT NULL,grace INTEGER NOT NULL,response INTEGER NOT NULL,defer INTEGER NOT NULL,cooldown INTEGER NOT NULL DEFAULT 480,effective_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS care_runs(id TEXT PRIMARY KEY,person_id TEXT NOT NULL REFERENCES people(id),day TEXT NOT NULL,due_at INTEGER NOT NULL,deadline INTEGER,question_id TEXT,state TEXT NOT NULL,reason TEXT NOT NULL,UNIQUE(person_id,day));
      CREATE TABLE IF NOT EXISTS care_steps(id INTEGER PRIMARY KEY AUTOINCREMENT,run_id TEXT NOT NULL REFERENCES care_runs(id),at INTEGER NOT NULL,kind TEXT NOT NULL,detail TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS care_alerts(id TEXT PRIMARY KEY,source_key TEXT NOT NULL UNIQUE,person_id TEXT NOT NULL REFERENCES people(id),run_id TEXT,kind TEXT NOT NULL,created_at INTEGER NOT NULL,read_at INTEGER,resolved_at INTEGER,payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS care_alerts_person ON care_alerts(person_id,created_at);
      CREATE INDEX IF NOT EXISTS care_runs_person ON care_runs(person_id,due_at);
    `);
    if (!storeHasColumn(this.s, 'care_plans', 'contextual_enabled')) this.s.db.exec('ALTER TABLE care_plans ADD COLUMN contextual_enabled INTEGER NOT NULL DEFAULT 1');
    if (!storeHasColumn(this.s, 'care_plans', 'cooldown')) this.s.db.exec('ALTER TABLE care_plans ADD COLUMN cooldown INTEGER NOT NULL DEFAULT 480');
    for (const p of this.s.all('SELECT * FROM people WHERE demo=0 AND help_id IS NOT NULL')) this.alert(p.id, `event:${p.help_id}`, 'help', HELP_TITLE[this.s.lang()], undefined, undefined, p.help_at);
  }
  s: CareStore;
  plan(personId: string): CarePlan {
    const r = this.s.get('SELECT * FROM care_plans WHERE person_id=?', personId);
    return r ? { enabled: !!r.enabled, contextualEnabled: !!r.contextual_enabled, graceMinutes: r.grace, responseMinutes: r.response, deferMinutes: r.defer, cooldownMinutes: r.cooldown } : { ...defaultPlan };
  }
  cooldownOk(personId: string, cooldownMinutes: number) {
    const last = this.s.get('SELECT created_at FROM questions WHERE person_id=? ORDER BY created_at DESC LIMIT 1', personId);
    return !last || this.s.now() - last.created_at >= cooldownMinutes * minute;
  }
  setPlan(identity: Identity, personId: string, value: unknown) {
    const p = this.s.person(identity, personId); demand(!p.demo, '示範對象不啟用自動關心');
    const b = object(value); demand(Object.keys(b).every(k => ['enabled', 'contextualEnabled', 'timeOfDay', 'graceMinutes', 'responseMinutes', 'deferMinutes', 'cooldownMinutes'].includes(k)), '關心設定含有不支援的欄位');
    demand(typeof b.enabled === 'boolean', '請選擇是否啟用');
    demand(b.contextualEnabled === undefined || typeof b.contextualEnabled === 'boolean', '情境確認設定不正確');
    for (const key of ['graceMinutes', 'responseMinutes', 'deferMinutes']) demand(Number.isInteger(b[key]) && (b[key] as number) >= 1 && (b[key] as number) <= 240, '等待時間需為一至 240 分鐘');
    // Legacy clients send timeOfDay and no cooldown; the clock is ignored and the default cooldown applies.
    const cooldown = b.cooldownMinutes === undefined ? defaultPlan.cooldownMinutes : b.cooldownMinutes;
    demand(Number.isInteger(cooldown) && (cooldown as number) >= 60 && (cooldown as number) <= 1440, '冷卻時間需為 60 至 1440 分鐘');
    return this.s.transaction(() => {
      const old = this.plan(personId), contextual = b.contextualEnabled === undefined ? old.contextualEnabled : b.contextualEnabled;
      const next = { enabled: b.enabled, contextualEnabled: contextual, graceMinutes: b.graceMinutes, responseMinutes: b.responseMinutes, deferMinutes: b.deferMinutes, cooldownMinutes: cooldown };
      if (JSON.stringify(old) === JSON.stringify(next)) return old;
      // Editing a schedule stops future automatic actions, but never dismisses an existing caregiver alert.
      for (const run of this.s.all("SELECT * FROM care_runs WHERE person_id=? AND state IN ('waiting','observing','question_pending','deferred')", personId)) {
        this.finish(run, 'cancelled', '關心設定已由照顧者修改');
      }
      // Old databases keep time_of_day NOT NULL without a default; upsert must supply it even though nothing reads it anymore.
      if (storeHasColumn(this.s, 'care_plans', 'time_of_day')) {
        this.s.run('INSERT INTO care_plans(person_id,enabled,time_of_day,grace,response,defer,cooldown,effective_at,contextual_enabled) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(person_id) DO UPDATE SET enabled=excluded.enabled,grace=excluded.grace,response=excluded.response,defer=excluded.defer,cooldown=excluded.cooldown,effective_at=excluded.effective_at,contextual_enabled=excluded.contextual_enabled', personId, b.enabled ? 1 : 0, '00:00', b.graceMinutes as number, b.responseMinutes as number, b.deferMinutes as number, cooldown as number, this.s.now(), contextual ? 1 : 0);
      } else {
        this.s.run('INSERT INTO care_plans(person_id,enabled,grace,response,defer,cooldown,effective_at,contextual_enabled) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(person_id) DO UPDATE SET enabled=excluded.enabled,grace=excluded.grace,response=excluded.response,defer=excluded.defer,cooldown=excluded.cooldown,effective_at=excluded.effective_at,contextual_enabled=excluded.contextual_enabled', personId, b.enabled ? 1 : 0, b.graceMinutes as number, b.responseMinutes as number, b.deferMinutes as number, cooldown as number, this.s.now(), contextual ? 1 : 0);
      }
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
  evidence(personId: string, lang?: Lang): string[] {
    const useLang = lang || this.s.lang(), en = useLang === 'en';
    const p = this.s.get('SELECT p.*,w.timezone FROM people p JOIN workspaces w ON w.id=p.workspace_id WHERE p.id=?', personId)!;
    const stamp = (at: number) => new Intl.DateTimeFormat(en ? 'en-US' : 'zh-TW', { timeZone: p.timezone, dateStyle: 'short', timeStyle: 'short' }).format(at);
    const lines = [p.last_seen === null ? (en ? 'No phone sync received yet' : '尚未收到手機同步') : (en ? `Last phone data received: ${stamp(p.last_seen)}` : `最後收到手機資料：${stamp(p.last_seen)}`)];
    if (p.context_json) {
      const c = JSON.parse(p.context_json);
      lines.push(en ? `Phone context observed: ${stamp(p.context_at)}` : `手機情境觀測：${stamp(p.context_at)}`);
      if (c.batteryPercent !== null) lines.push(en ? `Battery at the time ${c.batteryPercent}%${c.charging === true ? ', charging' : c.charging === false ? ', not charging' : ', charging state unknown'}` : `當時電量 ${c.batteryPercent}%${c.charging === true ? '，充電中' : c.charging === false ? '，未充電' : '，充電狀態未知'}`);
      lines.push(en ? `Network at sample: ${c.network === 'online' ? 'verified connection' : c.network === 'offline' ? 'no usable network' : 'unknown'}` : `取樣時網路：${c.network === 'online' ? '有經驗證連線' : c.network === 'offline' ? '沒有可用網路' : '未知'}`);
      const assessment = this.s.provider.assess(c, p.context_at, this.s.now(), useLang);
      lines.push(...assessment.evidence.filter(e => !/^(電量|Battery)/.test(e.label)).map(e => en ? `${e.label} (${stamp(e.observedAt)})` : `${e.label}（${stamp(e.observedAt)}）`), ...assessment.gaps.map(g => en ? `Data gap: ${g}` : `資料缺口：${g}`));
    }
    return lines;
  }
  alert(personId: string, key: string, kind: 'help' | 'unclarified', title: string, run?: Row, question?: Row, sourceObservedAt?: number, extraEvidence: string[] = []) {
    const answer = question?.answer_json ? JSON.parse(question.answer_json) : null;
    const lang = this.s.lang();
    const payload = { title, evidence: [...this.evidence(personId), ...extraEvidence, ...(sourceObservedAt === undefined ? [] : [(lang === 'en' ? 'Request sent at: ' : '本人發出請求的時間：') + new Date(sourceObservedAt).toISOString()])], question: question?.prompt || null, answer: answer ? answer.elseText || answer.label : null };
    this.s.run('INSERT OR IGNORE INTO care_alerts(id,source_key,person_id,run_id,kind,created_at,payload) VALUES(?,?,?,?,?,?,?)', randomUUID(), key, personId, run?.id || null, kind, this.s.now(), JSON.stringify(payload));
  }
  // Stored history keeps its original shells; known fixed templates are
  // re-rendered into the active language at read time, values verbatim
  // except zh-TW date stamps, which are re-rendered as en-US short.
  localizeAlert(alert: { title: string; evidence: string[]; question: string | null; answer: string | null }): { title: string; evidence: string[]; question: string | null; answer: string | null } {
    if (this.s.lang() !== 'en') return alert;
    const title = alert.title === HELP_TITLE.zh ? HELP_TITLE.en : alert.title;
    const evidence = (alert.evidence || []).map(line => {
      let m = line.match(/^尚未收到手機同步$/); if (m) return 'No phone sync received yet';
      m = line.match(/^最後收到手機資料：(.+)$/); if (m) return `Last phone data received: ${zhStampEn(m[1] || '')}`;
      m = line.match(/^手機情境觀測：(.+)$/); if (m) return `Phone context observed: ${zhStampEn(m[1] || '')}`;
      m = line.match(/^當時電量 (\d+)%(.*)$/); if (m) return `Battery at the time ${m[1]}%${(m[2] || '').replace('，充電中', ', charging').replace('，未充電', ', not charging').replace('，充電狀態未知', ', charging state unknown')}`;
      m = line.match(/^取樣時網路：(.+)$/); if (m) return `Network at sample: ${(m[1] || '').replace('有經驗證連線', 'verified connection').replace('沒有可用網路', 'no usable network').replace('未知', 'unknown')}`;
      m = line.match(/^本人發出請求的時間：(.+)$/); if (m) return `Request sent at: ${m[1]}`;
      m = line.match(/^資料缺口：(.+)$/); if (m) return `Data gap: ${evidenceLabelEn(m[1] || '')}`;
      m = line.match(/^(.+)（(.+)）$/); if (m) return `${evidenceLabelEn(m[1] || '')} (${zhStampEn(m[2] || '')})`;
      return line;
    });
    return { ...alert, title, evidence };
  }
  alerts(identity: Identity, personId?: string): CareAlert[] {
    if (personId) this.s.person(identity, personId);
    return this.s.all(`SELECT a.*,p.name FROM care_alerts a JOIN people p ON p.id=a.person_id WHERE p.workspace_id=? ${personId ? 'AND p.id=?' : ''} ORDER BY (a.resolved_at IS NULL) DESC,a.created_at DESC LIMIT 100`, identity.workspaceId, ...(personId ? [personId] : [])).map(a => ({ id: a.id, personId: a.person_id, personName: a.name, runId: a.run_id, kind: a.kind, createdAt: a.created_at, readAt: a.read_at, resolvedAt: a.resolved_at, ...this.localizeAlert(JSON.parse(a.payload)) }));
  }
  read(identity: Identity, alertId: string) {
    demand(this.s.get('SELECT a.id FROM care_alerts a JOIN people p ON p.id=a.person_id WHERE a.id=? AND p.workspace_id=?', alertId, identity.workspaceId), '找不到這則提醒', 404);
    this.s.run('UPDATE care_alerts SET read_at=COALESCE(read_at,?) WHERE id=?', this.s.now(), alertId); return { saved: true };
  }
  escalate(run: Row, reason: string) {
    const en = this.s.lang() === 'en';
    const q = run.question_id ? this.s.get('SELECT * FROM questions WHERE id=?', run.question_id) : undefined;
    let delivery = en ? 'The phone has not reported whether the question was shown' : '問題尚未由手機回報顯示結果';
    if (q) {
      const r = this.s.get('SELECT result FROM reminders WHERE question_id=? ORDER BY created_at DESC LIMIT 1', q.id);
      if (r?.result === 'executed') delivery = en ? 'The phone ran the notification flow; whether it was seen is unknown' : '手機已執行通知顯示流程，是否看到仍未知';
      else if (r?.result === 'declined') delivery = en ? 'The phone reported it cannot show notifications' : '手機回報無法顯示通知';
      if (q.answer_json) delivery = q.status === 'answered_late' ? (en ? 'A late answer arrived; the current situation still needs confirming' : '已收到延遲回答，仍需確認目前情況') : (en ? 'The person answered; the original text is attached to the alert' : '本人已回答這題，原文附於提醒');
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
      this.alert(personId, `event:${event.eventId}`, 'help', HELP_TITLE[this.s.lang()], undefined, event.questionId ? this.s.get('SELECT * FROM questions WHERE id=?', event.questionId) : undefined, event.observedAt);
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
    } else if (review === 'pending') this.escalate(run, this.s.lang() === 'en' ? 'The follow-up still needs the caregiver to clarify' : '本人補充的情況仍需照顧者釐清');
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
            this.step(run, 'video_wait', '前景影音 App 與播放線索持續一致，最多延後十五分鐘；不發出異常提醒');
            this.s.secretary.notes.videoWait(p.id, d); continue;
          }
          if (run.state === 'observing' && this.s.now() < run.deadline) {
            const latest = this.s.secretary.samples(p.id).at(-1);
            const sourcesKnown = latest && this.s.now() - latest.at <= 120000 && latest.context.sources?.usage === 'available' && latest.context.sources.media === 'available';
            if (video || !sourcesKnown) continue;
          }
          const q = this.s.ask(p.id, run.state === 'observing' ? videoQuestion(this.s.lang()) : missedCheckinQuestion(this.s.lang()), plan.responseMinutes * minute);
          if (run.state === 'observing') this.s.secretary.notes.askedVideo(p.id, d);
          this.s.run("UPDATE care_runs SET state='question_pending',question_id=?,deadline=?,reason=? WHERE id=?", q.id, q.expiresAt, '已提出一題，等待手機領取與本人回覆', run.id);
          this.s.run('INSERT INTO reminders(id,person_id,created_at,expires,question_id) SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM reminders WHERE question_id=?)', randomUUID(), p.id, this.s.now(), q.expiresAt, q.id, q.id);
          this.step(run, 'question_queued', run.state === 'observing' ? '影音線索改變或延後期限到達，現在詢問本人確認' : '到關心時間仍未報安，已排入一題與手機提醒');
        } else if (run.deadline !== null && this.s.now() >= run.deadline) this.escalate(run, run.state === 'deferred' ? (this.s.lang() === 'en' ? 'Deferred wait ended with no check-in received' : '延後等待結束，仍未收到本人報安') : (this.s.lang() === 'en' ? 'Answer wait ended; the situation is still unclear' : '回答等待時間結束，仍未釐清近況'));
      }
      for (const p of this.s.all('SELECT p.*,w.timezone,c.cooldown FROM people p JOIN workspaces w ON w.id=p.workspace_id JOIN care_plans c ON c.person_id=p.id WHERE c.enabled=1 AND p.demo=0')) {
        const day = dayAt(this.s.now(), p.timezone);
        if (this.s.get('SELECT id FROM care_runs WHERE person_id=? AND day=?', p.id, day)) continue;
        if (this.s.get("SELECT id FROM care_runs WHERE person_id=? AND state IN ('waiting','observing','question_pending','deferred','escalated')", p.id) || this.s.get("SELECT id FROM secretary_cases WHERE person_id=? AND state IN ('question_pending','deferred','escalated')", p.id)) continue;
        const satisfied = p.last_checkin !== null && dayAt(p.last_checkin, p.timezone) === day;
        if (satisfied || p.help_id) {
          const state = satisfied ? 'clarified' : 'resolved', reason = satisfied ? '今天已收到本人報安' : '已有本人求助，交由求助待辦處理';
          const run = { id: randomUUID(), person_id: p.id };
          this.s.run('INSERT INTO care_runs(id,person_id,day,due_at,state,reason) VALUES(?,?,?,?,?,?)', run.id, p.id, day, this.s.now(), state, reason);
          this.step(run, state, reason); continue;
        }
        if (!this.cooldownOk(p.id, Number(p.cooldown ?? defaultPlan.cooldownMinutes))) continue;
        const clock = wall(this.s.now(), p.timezone).clock;
        if (clock < askStart || clock >= askEnd) continue;
        const interactive = p.context_at !== null && this.s.now() - p.context_at <= 120000 && (() => { try { return JSON.parse(p.context_json).screenInteractive === true; } catch { return false; } })();
        if (!interactive && clock < fallbackAt) continue;
        const reason = interactive ? '本人正在使用手機，先觀察幾分鐘再決定是否提問' : '今天尚未問候本人，已到晚間保底時間，先觀察再決定';
        const run = { id: randomUUID(), person_id: p.id };
        this.s.run('INSERT INTO care_runs(id,person_id,day,due_at,state,reason) VALUES(?,?,?,?,?,?)', run.id, p.id, day, this.s.now(), 'waiting', reason);
        this.step(run, 'waiting', reason);
      }
    });
  }
}
function storeHasColumn(s: CareStore, table: string, column: string) { return s.all(`PRAGMA table_info(${table})`).some(c => c.name === column); }
