import type { CareStore } from './store.ts';
import type { ContextDecision, MetaIntegration } from '../shared/protocol.ts';
import { dayAt } from './domain.ts';
import { MetaApi, MetaApiError, metaInput } from './meta-api.ts';
import type { MetaConfig } from './meta-api.ts';

export class MetaSecretary {
  #store: CareStore;
  #config: MetaConfig;
  #api: MetaApi;
  #busy = false;
  #stopped = false;
  #blocked = false;
  #abort = new AbortController();
  #requestId: number | null = null;
  #lastError: string | null = null;
  #lastSuccessAt: number | null = null;
  constructor(store: CareStore, config: MetaConfig, api = new MetaApi(config)) {
    this.#store = store; this.#config = config; this.#api = api;
    store.db.exec(`CREATE TABLE IF NOT EXISTS meta_decisions(person_id TEXT PRIMARY KEY REFERENCES people(id),signature TEXT NOT NULL,decision_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS meta_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,person_id TEXT NOT NULL REFERENCES people(id),at INTEGER NOT NULL,model TEXT NOT NULL,status TEXT NOT NULL,error_code TEXT,input_tokens INTEGER NOT NULL DEFAULT 0,output_tokens INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS meta_requests_time ON meta_requests(at);`);
  }
  requestsToday() {
    const day = dayAt(this.#store.now(), 'Asia/Taipei');
    return this.#store.all('SELECT at FROM meta_requests WHERE at>=?', this.#store.now() - 2 * 86400000).filter(r => dayAt(r.at, 'Asia/Taipei') === day).length;
  }
  status(): MetaIntegration {
    const c = this.#config, enabled = c.enabled && !!c.key, used = this.requestsToday();
    return { enabled, model: enabled ? c.model : null,
      status: !c.enabled ? 'disabled' : !c.key ? 'key_missing' : used >= c.dailyLimit ? 'daily_limit' : this.#lastError ? 'fallback' : this.#busy ? 'connecting' : this.#lastSuccessAt ? 'active' : 'ready',
      requestsToday: used, dailyLimit: c.dailyLimit, lastSuccessAt: this.#lastSuccessAt, lastError: this.#lastError };
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
    const people = s.all(`SELECT p.id,MAX(r.at) AS attempted_at FROM people p LEFT JOIN meta_requests r ON r.person_id=p.id WHERE p.demo=0 GROUP BY p.id ORDER BY attempted_at ASC,p.id`);
    for (const p of people) {
      const prior = s.get('SELECT at,error_code FROM meta_requests WHERE person_id=? ORDER BY id DESC LIMIT 1', p.id);
      const cooldown = prior?.error_code ? Math.max(300000, c.intervalMs) : c.intervalMs;
      if (prior && s.now() - prior.at < cooldown) continue;
      const samples = s.secretary.samples(p.id), local = s.secretary.interpreter.evaluate(samples, s.now());
      const input = metaInput(samples, s.now(), local, c.notificationText);
      if (!input) continue;
      this.#busy = true;
      s.run("INSERT INTO meta_requests(person_id,at,model,status) VALUES(?,?,?,'pending')", p.id, s.now(), c.model);
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
    // ELSE review is user-triggered, so it bypasses the 120-second
    // scheduler interval, but it still respects one request at a time,
    // the daily limit, and a blocked Meta state. Any failure leaves
    // the ELSE answer pending, so a caregiver alert is never lost.
    if (this.#busy || this.#stopped || this.#blocked || !c.enabled || !c.key || this.#lastError || this.requestsToday() >= c.dailyLimit) return null;
    this.#busy = true;
    s.run("INSERT INTO meta_requests(person_id,at,model,status) VALUES(?,?,?,'pending')", args.personId, s.now(), c.model);
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
