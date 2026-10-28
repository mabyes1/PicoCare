import { randomUUID } from 'node:crypto';
import type { CareStore, Identity } from './store.ts';
import type { ContextDecision, SecretaryCase, SecretaryView } from '../shared/protocol.ts';
import type { DeviceEvent } from './domain.ts';
import { demand, object } from './domain.ts';
import { LocalSituationInterpreter } from './context-engine.ts';
import type { ContextSample, SituationInterpreter } from './context-engine.ts';
import { outingQuestion, metaOutingQuestion } from './questions.ts';
import type { MetaSecretary } from './meta-secretary.ts';
type Row = Record<string, any>;
const minute = 60000;
export class Secretary {
  interpreter: SituationInterpreter = new LocalSituationInterpreter();
  model: MetaSecretary | null = null;
  constructor(store: CareStore) {
    this.s = store;
    store.db.exec(`CREATE TABLE IF NOT EXISTS secretary_state(person_id TEXT PRIMARY KEY REFERENCES people(id),input_key TEXT NOT NULL,decision_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS secretary_decisions(id INTEGER PRIMARY KEY AUTOINCREMENT,person_id TEXT NOT NULL REFERENCES people(id),at INTEGER NOT NULL,decision_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS secretary_cases(id TEXT PRIMARY KEY,person_id TEXT NOT NULL REFERENCES people(id),created_at INTEGER NOT NULL,deadline INTEGER,question_id TEXT NOT NULL,state TEXT NOT NULL,reason TEXT NOT NULL,decision_json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS secretary_cases_person ON secretary_cases(person_id,created_at);
      CREATE INDEX IF NOT EXISTS context_observation ON events(person_id,kind,observed_at);`);
  }
  s: CareStore;
  samples(personId: string): ContextSample[] {
    return this.s.all("SELECT event_id,observed_at,body FROM events WHERE person_id=? AND kind='context' AND observed_at>=? AND observed_at<=? ORDER BY observed_at DESC LIMIT 180", personId, this.s.now() - 45 * minute, this.s.now())
      .map(r => ({ id: r.event_id, at: r.observed_at, context: JSON.parse(r.body).context })).reverse();
  }
  decision(personId: string): ContextDecision {
    const row = this.s.get('SELECT decision_json FROM secretary_state WHERE person_id=?', personId);
    const local = row ? JSON.parse(row.decision_json) : this.interpreter.evaluate([], this.s.now());
    return this.model?.decision(personId, local) || local;
  }
  current(personId: string): Row | undefined { return this.s.get('SELECT * FROM secretary_cases WHERE person_id=? ORDER BY created_at DESC LIMIT 1', personId); }
  view(personId: string): SecretaryView {
    const r = this.current(personId);
    const q = this.s.get("SELECT topic,answer_json FROM questions WHERE person_id=? AND topic IN ('video','outing') AND status='answered' AND answer_json IS NOT NULL ORDER BY created_at DESC LIMIT 1", personId);
    const answer = q ? JSON.parse(q.answer_json) : null;
    const confirmation = answer?.review === 'clarified' ? { topic: q!.topic, text: answer.elseText || answer.label, observedAt: answer.observedAt } : null;
    return { decision: this.decision(personId), outing: r ? { id: r.id, state: r.state, createdAt: r.created_at, deadline: r.deadline, questionId: r.question_id, reason: r.reason, decision: JSON.parse(r.decision_json) } as SecretaryCase : null, confirmation };
  }
  finish(r: Row, state: string, reason: string) {
    this.s.run('UPDATE secretary_cases SET state=?,reason=?,deadline=NULL WHERE id=?', state, reason, r.id);
    this.s.run("UPDATE questions SET status='cancelled' WHERE id=? AND status='open'", r.question_id);
    this.s.run("UPDATE reminders SET result='cancelled',completed_at=? WHERE question_id=? AND result='pending'", this.s.now(), r.question_id);
    this.s.run('UPDATE care_alerts SET resolved_at=? WHERE run_id=? AND resolved_at IS NULL', this.s.now(), r.id);
  }
  resolve(identity: Identity, personId: string, value: unknown) {
    this.s.person(identity, personId); const b = object(value), r = this.current(personId);
    demand(r && r.id === b.caseId && ['question_pending', 'deferred', 'escalated'].includes(r.state), '外出確認已有更新，請重新查看', 409);
    this.s.transaction(() => this.finish(r, 'resolved', '照顧者已聯絡並釐清外出情況')); return { saved: true };
  }
  escalate(r: Row, reason: string) {
    const q = this.s.get('SELECT * FROM questions WHERE id=?', r.question_id)!;
    const a = q.answer_json ? JSON.parse(q.answer_json) : null;
    const reminder = this.s.get('SELECT result FROM reminders WHERE question_id=? ORDER BY created_at DESC LIMIT 1', q.id);
    const delivery = a ? '已收到本人回答，內容附於提醒' : reminder?.result === 'executed' ? '手機已執行通知顯示，是否看到未知' : reminder?.result === 'declined' ? '手機無法顯示通知' : '尚未收到手機顯示結果';
    const full = `${reason}；${delivery}`;
    const decision: ContextDecision = JSON.parse(r.decision_json);
    this.s.flow.alert(r.person_id, `secretary:${r.id}`, 'unclarified', full, r, q, undefined, decision.evidence.map(e => `${e.label}（觀測 ${new Date(e.observedAt).toISOString()}，事件 ${e.eventId}）`));
    this.s.run("UPDATE secretary_cases SET state='escalated',reason=? WHERE id=?", full, r.id);
    this.s.run("UPDATE questions SET expires=MIN(expires,?) WHERE id=? AND status='open'", this.s.now(), q.id);
  }
  onEvent(personId: string, event: DeviceEvent, review?: string) {
    const r = this.current(personId);
    if (!r || !['question_pending', 'deferred', 'escalated'].includes(r.state)) return;
    if (event.kind === 'help') { this.finish(r, 'resolved', '本人已明確求助，交由獨立求助待辦處理'); return; }
    if (event.kind === 'checkin' && event.observedAt >= r.created_at - 120000 && this.s.now() - event.observedAt <= 120000) {
      this.finish(r, 'clarified', '本人另外送出報安；外出細節仍以本人原話為準'); return;
    }
    if (event.kind !== 'question_answer' || event.questionId !== r.question_id) return;
    const q = this.s.get('SELECT * FROM questions WHERE id=?', r.question_id)!;
    if (review === 'needs_contact') {
      const alert = this.s.get('SELECT id,payload FROM care_alerts WHERE source_key=?', `event:${event.eventId}`);
      if (alert) {
        const payload = JSON.parse(alert.payload), d: ContextDecision = JSON.parse(r.decision_json);
        payload.title = '本人表示正在找路，請家人聯絡';
        payload.evidence.push(...d.evidence.map(e => `${e.label}（${new Date(e.observedAt).toISOString()}）`));
        this.s.run('UPDATE care_alerts SET payload=? WHERE id=?', JSON.stringify(payload), alert.id);
      }
      this.finish(r, 'resolved', '本人表示正在找路並希望聯絡，交由獨立求助待辦處理'); return;
    }
    if (q.status === 'answered_late' || r.state === 'escalated') return;
    const a = JSON.parse(q.answer_json);
    if (review === 'clarified') this.finish(r, 'clarified', `本人已確認：${a.label}`);
    else if (review === 'deferred') this.s.run("UPDATE secretary_cases SET state='deferred',deadline=?,reason=? WHERE id=?", this.s.now() + Math.min(10, this.s.flow.plan(personId).deferMinutes) * minute, '本人暫時不方便；延後等待報安，不重複提問', r.id);
    else if (review === 'pending') this.escalate(r, '外出確認收到補充，仍需照顧者釐清');
  }
  tick() {
    for (const p of this.s.all('SELECT * FROM people WHERE demo=0')) {
      const samples = this.samples(p.id), last = samples.at(-1);
      // Re-evaluate when source events or freshness change.
      const key = `tone-2/${samples.length}/${samples[0]?.id || ''}/${last?.id || ''}/${last && this.s.now() - last.at <= 120000 ? 'recent' : 'old'}`;
      const prior = this.s.get('SELECT * FROM secretary_state WHERE person_id=?', p.id);
      if (!prior || prior.input_key !== key) {
        const d = this.interpreter.evaluate(samples, this.s.now()), body = JSON.stringify(d);
        this.s.run('INSERT INTO secretary_state VALUES(?,?,?) ON CONFLICT(person_id) DO UPDATE SET input_key=excluded.input_key,decision_json=excluded.decision_json', p.id, key, body);
        this.s.run('INSERT INTO secretary_decisions(person_id,at,decision_json) VALUES(?,?,?)', p.id, this.s.now(), body);
      }
      const current = this.current(p.id), plan = this.s.flow.plan(p.id);
      if (current && ['question_pending', 'deferred'].includes(current.state)) {
        if (!plan.contextualEnabled) this.finish(current, 'cancelled', '情境主動確認已停用');
        else if (this.s.now() >= current.deadline) this.escalate(current, '外出變化已詢問本人，等待後仍未釐清');
      }
      const d = this.decision(p.id);
      if (!plan.contextualEnabled || p.help_id || d.action !== 'confirm' || d.validUntil <= this.s.now() || !this.s.flow.cooldownOk(p.id, plan.cooldownMinutes) || current && (['question_pending', 'deferred', 'escalated'].includes(current.state) || this.s.now() - current.created_at < 6 * 3600000)) continue;
      // A specific outing concern replaces a generic check-in question, retaining the old question as cancelled history.
      for (const run of this.s.all("SELECT * FROM care_runs WHERE person_id=? AND state IN ('waiting','observing','question_pending','deferred')", p.id)) this.s.flow.finish(run, 'cancelled', '外出變化優先確認，日常報安提問已讓位');
      this.s.run("UPDATE reminders SET result='cancelled',completed_at=? WHERE person_id=? AND result='pending'", this.s.now(), p.id);
      this.s.run("UPDATE questions SET status='cancelled' WHERE person_id=? AND status='open'", p.id);
      const q = this.s.ask(p.id, d.source === 'meta' ? metaOutingQuestion(d.title) : outingQuestion(), Math.min(5, plan.responseMinutes) * minute);
      const caseId = randomUUID(), reason = '外出線索出現變化，已主動問一題，等待本人釐清';
      this.s.run('INSERT INTO secretary_cases VALUES(?,?,?,?,?,?,?,?)', caseId, p.id, this.s.now(), q.expiresAt, q.id, 'question_pending', reason, JSON.stringify(d));
      this.s.run('INSERT INTO reminders(id,person_id,created_at,expires,question_id) VALUES(?,?,?,?,?)', randomUUID(), p.id, this.s.now(), q.expiresAt, q.id);
    }
  }
}
