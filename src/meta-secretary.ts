import type { CareStore } from './store.ts';
import type { ContextDecision, MetaIntegration } from '../shared/protocol.ts';
import { dayAt } from './domain.ts';
import { MetaApi, MetaApiError, basetenBaseUrl, metaInput } from './meta-api.ts';
import type { MetaConfig } from './meta-api.ts';

export class MetaSecretary {
  #store: CareStore;
  #config: MetaConfig;
  #api: MetaApi;
  #openApi: MetaApi | null;
  #busy = false;
  #stopped = false;
  #blocked = false;
  #abort = new AbortController();
  #requestId: number | null = null;
  #lastError: string | null = null;
  #lastSuccessAt: number | null = null;
  #lastSkipAt: number | null = null;
  #lastSkipReason: string | null = null;
  #priority = new Map<string, number>();
  constructor(store: CareStore, config: MetaConfig, api = new MetaApi(config), openApi: MetaApi | null = config.openKey ? new MetaApi(config, fetch, { baseUrl: basetenBaseUrl, key: config.openKey, model: config.openModel, structured: false }) : null) {
    this.#store = store; this.#config = config; this.#api = api; this.#openApi = openApi;
    store.db.exec(`CREATE TABLE IF NOT EXISTS meta_decisions(person_id TEXT PRIMARY KEY REFERENCES people(id),signature TEXT NOT NULL,decision_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS meta_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,person_id TEXT NOT NULL REFERENCES people(id),at INTEGER NOT NULL,model TEXT NOT NULL,status TEXT NOT NULL,error_code TEXT,input_tokens INTEGER NOT NULL DEFAULT 0,output_tokens INTEGER NOT NULL DEFAULT 0,kind TEXT,state_key TEXT);
      CREATE INDEX IF NOT EXISTS meta_requests_time ON meta_requests(at);
      CREATE TABLE IF NOT EXISTS secretary_weekly(person_id TEXT PRIMARY KEY REFERENCES people(id),at INTEGER NOT NULL,text TEXT NOT NULL,model TEXT NOT NULL);`);
    if (!storeHasColumn(store, 'meta_requests', 'kind')) store.db.exec('ALTER TABLE meta_requests ADD COLUMN kind TEXT');
    if (!storeHasColumn(store, 'meta_requests', 'state_key')) store.db.exec('ALTER TABLE meta_requests ADD COLUMN state_key TEXT');
    if (config.openModel) store.run("UPDATE meta_requests SET kind='weekly' WHERE kind IS NULL AND model=?", config.openModel);
  }
  requestsToday() {
    const day = dayAt(this.#store.now(), 'Asia/Taipei');
    // The daily budget counts Meta-model calls only; open-weight calls ride free.
    return this.#store.all('SELECT at,model FROM meta_requests WHERE at>=?', this.#store.now() - 2 * 86400000)
      .filter(r => dayAt(r.at, 'Asia/Taipei') === day && r.model !== this.#config.openModel).length;
  }
  status(): MetaIntegration {
    const c = this.#config, enabled = c.enabled && !!c.key, used = this.requestsToday();
    return { enabled, model: enabled ? c.model : null,
      status: !c.enabled ? 'disabled' : !c.key ? 'key_missing' : used >= c.dailyLimit ? 'daily_limit' : this.#lastError ? 'fallback' : this.#busy ? 'connecting' : this.#lastSuccessAt ? 'active' : 'ready',
      requestsToday: used, dailyLimit: c.dailyLimit, lastSuccessAt: this.#lastSuccessAt, lastError: this.#lastError,
      lastSkipAt: this.#lastSkipAt, lastSkipReason: this.#lastSkipReason };
  }
  weekly(personId: string): { text: string; at: number; model: string } | null {
    const row = this.#store.get('SELECT * FROM secretary_weekly WHERE person_id=?', personId);
    return row ? { text: row.text, at: row.at, model: row.model } : null;
  }
  weeklyInput(personId: string) {
    const s = this.#store, since = s.now() - 7 * 86400000;
    const tz = s.get('SELECT w.timezone AS tz FROM people p JOIN workspaces w ON w.id=p.workspace_id WHERE p.id=?', personId)?.tz || 'Asia/Taipei';
    const notes = s.all('SELECT * FROM secretary_notes WHERE person_id=? AND at>=? ORDER BY at ASC LIMIT 20', personId, since)
      .map(r => ({ day: dayAt(r.at, tz), title: String(r.title).slice(0, 60), body: String(r.body).slice(0, 200) }));
    if (notes.length < 3) return null;
    const answers = s.all("SELECT topic,answer_json FROM questions WHERE person_id=? AND status='answered' AND answer_json IS NOT NULL ORDER BY created_at DESC LIMIT 10", personId)
      .map(q => { const a = JSON.parse(q.answer_json); return { day: dayAt(a.observedAt, tz), question: String(q.topic), answer: String(a.elseText || a.label || '').slice(0, 200) }; })
      .filter(a => a.answer);
    const checkins = Number(s.get("SELECT count(*) n FROM events WHERE person_id=? AND kind='checkin' AND observed_at>=?", personId, since)!.n);
    const name = s.get('SELECT name FROM people WHERE id=?', personId)!.name;
    return { personName: String(name).slice(0, 40), weekLabel: `${dayAt(since, tz)}～${dayAt(s.now(), tz)}`, notes, answers, checkins };
  }
  async weeklyTick(): Promise<void> {
    const s = this.#store, c = this.#config, via = this.#openApi || this.#api, model = this.#openApi ? c.openModel : c.model;
    if (this.#busy || this.#stopped || this.#blocked || !c.enabled || (!c.key && !this.#openApi)) return;
    if (!this.#openApi && this.requestsToday() >= c.dailyLimit) return;
    for (const p of s.all('SELECT id FROM people WHERE demo=0')) {
      const prior = s.get('SELECT at FROM secretary_weekly WHERE person_id=?', p.id);
      if (prior && s.now() - prior.at < 7 * 86400000) continue;
      const req = s.get("SELECT at,error_code FROM meta_requests WHERE person_id=? AND kind='weekly' ORDER BY id DESC LIMIT 1", p.id);
      const cooldown = req?.error_code ? Math.max(300000, c.intervalMs) : c.intervalMs;
      if (req && s.now() - req.at < cooldown) continue;
      const input = this.weeklyInput(p.id);
      if (!input) continue;
      this.#busy = true;
      s.run("INSERT INTO meta_requests(person_id,at,model,status,kind) VALUES(?,?,?,'pending','weekly')", p.id, s.now(), model);
      this.#requestId = Number(s.get('SELECT last_insert_rowid() AS id')!.id);
      try {
        const result = await via.weeklyReview(input, this.#abort.signal);
        if (this.#stopped) return;
        s.transaction(() => {
          s.run('UPDATE meta_requests SET status=?,input_tokens=?,output_tokens=? WHERE id=?', 'accepted', result.inputTokens, result.outputTokens, this.#requestId!);
          s.run('INSERT INTO secretary_weekly VALUES(?,?,?,?) ON CONFLICT(person_id) DO UPDATE SET at=excluded.at,text=excluded.text,model=excluded.model', p.id, s.now(), result.text, model);
        });
        this.#lastError = null; this.#lastSuccessAt = s.now();
      } catch (error) {
        if (this.#stopped) return;
        const code = error instanceof MetaApiError ? error.code : 'internal_error';
        this.#lastError = code;
        if (['http_400', 'http_401', 'http_403', 'http_404'].includes(code)) this.#blocked = true;
        s.run("UPDATE meta_requests SET status='error',error_code=? WHERE id=?", code, this.#requestId!);
      } finally { this.#busy = false; this.#requestId = null; }
      return;
    }
  }
  latestDecision(personId: string): ContextDecision | null {
    const row = this.#store.get('SELECT decision_json FROM meta_decisions WHERE person_id=?', personId);
    return row ? JSON.parse(row.decision_json) : null;
  }
  // Ask-time judgment: the secretary may hold one question briefly for a
  // fresh cloud read. canAttempt is the no-stall promise — when false, the
  // question goes out immediately with the local read.
  canAttempt() {
    const c = this.#config;
    return !this.#stopped && !this.#blocked && c.enabled && !!c.key && !this.#lastError && this.requestsToday() < c.dailyLimit;
  }
  requestPriority(personId: string) { if (!this.#priority.has(personId)) this.#priority.set(personId, this.#store.now()); }
  priorityWaited(personId: string): number | null { const t = this.#priority.get(personId); return t === undefined ? null : this.#store.now() - t; }
  clearPriority(personId: string) { this.#priority.delete(personId); }
  hasFreshRead(personId: string): boolean {
    const row = this.#store.get('SELECT decision_json FROM meta_decisions WHERE person_id=?', personId);
    if (!row) return false;
    const d: ContextDecision = JSON.parse(row.decision_json);
    return d.model === this.#config.model && d.at + 120000 > this.#store.now();
  }
  decision(personId: string, local: ContextDecision): ContextDecision | null {
    if (!this.#config.enabled || !this.#config.key || this.#lastError || this.#stopped) return null;
    const row = this.#store.get('SELECT * FROM meta_decisions WHERE person_id=?', personId);
    if (!row) return null;
    const input = metaInput(this.#store.secretary.samples(personId), this.#store.now(), local, this.#config.notificationText);
    const decision: ContextDecision = JSON.parse(row.decision_json);
    if (!input || row.signature !== input.signature || decision.model !== this.#config.model || decision.validUntil <= this.#store.now()) return null;
    // Wild: gates are advisory only. MetaApi.infer already enforced the
    // wild evidence guard for a Meta-only wait/confirm, so a decision
    // that reaches here may override a local unknown/none.
    if (local.action === 'confirm' && decision.action !== 'confirm') return null;
    return decision;
  }
  async tick(): Promise<void> {
    const s = this.#store, c = this.#config;
    if (this.#busy || this.#stopped || this.#blocked || !c.enabled || !c.key || this.requestsToday() >= c.dailyLimit) return;
    for (const [id, at] of this.#priority) if (s.now() - at > 60000) this.#priority.delete(id);
    const people = s.all(`SELECT p.id,MAX(r.at) AS attempted_at FROM people p LEFT JOIN meta_requests r ON r.person_id=p.id AND (r.kind IS NULL OR r.kind='infer') WHERE p.demo=0 GROUP BY p.id ORDER BY attempted_at ASC,p.id`);
    people.sort((a, b) => Number(this.#priority.has(b.id)) - Number(this.#priority.has(a.id)));
    for (const p of people) {
      const priority = this.#priority.has(p.id);
      const prior = s.get("SELECT at,error_code,state_key FROM meta_requests WHERE person_id=? AND (kind IS NULL OR kind='infer') ORDER BY id DESC LIMIT 1", p.id);
      const cooldown = prior?.error_code ? Math.max(300000, c.intervalMs) : c.intervalMs;
      if (!priority && prior && s.now() - prior.at < cooldown) { this.#lastSkipAt = s.now(); this.#lastSkipReason = 'interval'; continue; }
      const samples = s.secretary.samples(p.id), local = s.secretary.interpreter.evaluate(samples, s.now());
      const input = metaInput(samples, s.now(), local, c.notificationText);
      if (!input) continue;
      // Batch judgment: unchanged evidence gets no new call, even past the
      // interval. A failed attempt still retries, since nothing was learned.
      if (!priority && prior && !prior.error_code && prior.state_key === input.stateKey) { this.#lastSkipAt = s.now(); this.#lastSkipReason = 'unchanged'; continue; }
      // A priority read is one shot: after a failure the question falls back
      // to the local read, and the background batch owns the retry.
      if (priority && this.#lastError) continue;
      this.#busy = true;
      s.run("INSERT INTO meta_requests(person_id,at,model,status,kind,state_key) VALUES(?,?,?,'pending','infer',?)", p.id, s.now(), c.model, input.stateKey);
      this.#requestId = Number(s.get('SELECT last_insert_rowid() AS id')!.id);
      try {
        const result = await this.#api.infer(input, s.now(), this.#abort.signal);
        if (this.#stopped) return;
        const currentSamples = s.secretary.samples(p.id);
        const latest = metaInput(currentSamples, s.now(), s.secretary.interpreter.evaluate(currentSamples, s.now()), c.notificationText);
        const usable = latest?.signature === input.signature && result.decision.validUntil > s.now();
        result.decision.at = s.now();
        s.transaction(() => {
          s.run('UPDATE meta_requests SET status=?,input_tokens=?,output_tokens=? WHERE id=?', usable ? 'accepted' : 'superseded', result.inputTokens, result.outputTokens, this.#requestId!);
          if (usable) s.run('INSERT INTO meta_decisions VALUES(?,?,?) ON CONFLICT(person_id) DO UPDATE SET signature=excluded.signature,decision_json=excluded.decision_json', p.id, input.signature, JSON.stringify(result.decision));
        });
        this.#lastError = null; this.#lastSuccessAt = s.now();
      } catch (error) {
        if (this.#stopped) return;
        const code = error instanceof MetaApiError ? error.code : 'internal_error';
        this.#lastError = code;
        if (['http_400', 'http_401', 'http_403', 'http_404'].includes(code)) this.#blocked = true;
        s.run("UPDATE meta_requests SET status='error',error_code=? WHERE id=?", code, this.#requestId!);
      } finally { this.#busy = false; this.#requestId = null; }
      return;
    }
  }
  async reviewElse(args: { personId: string; questionId: string; prompt: string; options: { label: string }[]; elseText: string }): Promise<import('../shared/protocol.ts').ElseReview | null> {
    const s = this.#store, c = this.#config;
    // ELSE review is user-triggered, so it bypasses the batch judgment
    // interval, but it still respects one request at a time,
    // the daily limit, and a blocked Meta state. Any failure leaves
    // the ELSE answer pending, so a caregiver alert is never lost.
    if (this.#busy || this.#stopped || this.#blocked || !c.enabled || !c.key || this.#lastError || this.requestsToday() >= c.dailyLimit) return null;
    this.#busy = true;
    s.run("INSERT INTO meta_requests(person_id,at,model,status,kind) VALUES(?,?,?,'pending','else')", args.personId, s.now(), c.model);
    this.#requestId = Number(s.get('SELECT last_insert_rowid() AS id')!.id);
    try {
      const result = await this.#api.reviewElse({ prompt: args.prompt, options: args.options, elseText: args.elseText }, this.#abort.signal);
      if (this.#stopped) return null;
      s.run('UPDATE meta_requests SET status=?,input_tokens=?,output_tokens=? WHERE id=?', 'accepted', result.inputTokens, result.outputTokens, this.#requestId!);
      this.#lastError = null; this.#lastSuccessAt = s.now();
      return { review: result.review, summary: result.summary };
    } catch (error) {
      if (this.#stopped) return null;
      const code = error instanceof MetaApiError ? error.code : 'internal_error';
      this.#lastError = code;
      if (['http_400', 'http_401', 'http_403', 'http_404'].includes(code)) this.#blocked = true;
      s.run("UPDATE meta_requests SET status='error',error_code=? WHERE id=?", code, this.#requestId!);
      return null;
    } finally { this.#busy = false; this.#requestId = null; }
  }
  close() {
    if (this.#stopped) return;
    this.#stopped = true; this.#abort.abort();
    if (this.#requestId !== null) this.#store.run("UPDATE meta_requests SET status='cancelled' WHERE id=? AND status='pending'", this.#requestId);
  }
}
function storeHasColumn(s: CareStore, table: string, column: string) { return s.all(`PRAGMA table_info(${table})`).some(c => c.name === column); }
