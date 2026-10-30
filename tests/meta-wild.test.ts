import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { CareStore } from '../src/store.ts';
import { MetaApi, metaConfig, metaInput } from '../src/meta-api.ts';
import { MetaSecretary } from '../src/meta-secretary.ts';
import { LocalSituationInterpreter } from '../src/context-engine.ts';
import type { ContextSample } from '../src/context-engine.ts';
import { metaOutingQuestion } from '../src/questions.ts';

const base = Date.parse('2026-10-28T12:00:00Z');
const m = 60000;
const config = () => metaConfig({ PICOCARE_META_ENABLED: 'true', MODEL_API_KEY: 'test-secret-never-publish' });
const reply = (body: unknown, finish = 'stop') => Response.json({ choices: [{ finish_reason: finish, message: { content: JSON.stringify(body) } }], usage: { prompt_tokens: 500, completion_tokens: 100 } });
const replyElse = (body: unknown) => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(body) } }], usage: { prompt_tokens: 50, completion_tokens: 20 } });

function wildSamples(): ContextSample[] {
  // Straight line, navigation + movement, battery fine, no revisit, no
  // drain: the local outing gate never fires on this, by design.
  return Array.from({ length: 9 }, (_, i) => {
    const at = base + i * m;
    return { id: randomUUID(), at, context: {
      batteryPercent: 80, charging: false, network: 'online', screenInteractive: true, ringer: 'normal', motion: 'moving',
      motionEvidence: { observedAt: at, accuracy: 10, speed: 2, speedAccuracy: 1 },
      location: { latitude: 25 + i * 0.002, longitude: 121, accuracy: 10, observedAt: at },
      notifications: [{ category: 'navigation', observedAt: at }], sharing: 'detailed',
      sources: { notifications: 'available', location: 'available', usage: 'disabled', media: 'disabled' },
    } };
  });
}
function videoSamples(): ContextSample[] {
  // Only two consistent video samples: the local video gate needs three.
  return [0, 1].map((i) => {
    const at = base + i * m;
    return { id: randomUUID(), at, context: {
      batteryPercent: 80, charging: false, network: 'online', screenInteractive: true, ringer: 'normal', motion: 'unknown',
      location: null, notifications: [], sharing: 'summary',
      sources: { notifications: 'available', location: 'disabled', usage: 'available', media: 'available' },
      usage: { appId: 'com.google.android.youtube', category: 'video', observedAt: at, changedAt: base },
      media: { appId: 'com.google.android.youtube', state: 'playing', observedAt: at },
    } };
  });
}

test('Meta-only outing confirm fires where local gates do not, with latest facts', async () => {
  const samples = wildSamples(), now = base + 8 * m;
  const local = new LocalSituationInterpreter().evaluate(samples, now);
  assert.notEqual(local.action, 'confirm');
  const input = metaInput(samples, now, local)!;
  const latestIds = input.facts.filter((f) => f.observedAt === input.observedAt).slice(0, 2).map((f) => f.id);
  assert.equal(latestIds.length, 2);
  const body = { scenario: 'outing', action: 'confirm', title: '看起來正在外出', reason: '導航與移動線索同時出現。', evidenceIds: latestIds, alternatives: [], gaps: [] };
  const r = await new MetaApi(config(), async () => reply(body)).infer(input, now);
  assert.equal(r.decision.source, 'meta');
  assert.equal(r.decision.scenario, 'outing');
  assert.equal(r.decision.action, 'confirm');
  assert.equal(r.decision.evidence.length, 2);
});

test('Meta-only wait/confirm with one fact, or with only stale facts, is rejected', async () => {
  const samples = wildSamples(), now = base + 8 * m;
  const local = new LocalSituationInterpreter().evaluate(samples, now);
  const input = metaInput(samples, now, local)!;
  const latestIds = input.facts.filter((f) => f.observedAt === input.observedAt).slice(0, 2).map((f) => f.id);
  const staleIds = input.facts.filter((f) => f.observedAt !== input.observedAt).slice(0, 2).map((f) => f.id);
  const baseBody = { scenario: 'outing', action: 'confirm', title: '看起來正在外出', reason: '導航與移動線索同時出現。', alternatives: [], gaps: [] };
  await assert.rejects(new MetaApi(config(), async () => reply({ ...baseBody, evidenceIds: [latestIds[0]] })).infer(input, now), /invalid_output/);
  await assert.rejects(new MetaApi(config(), async () => reply({ ...baseBody, evidenceIds: staleIds })).infer(input, now), /invalid_output/);
});

test('Meta-only video wait fires with two samples where local needs three', async () => {
  const samples = videoSamples(), now = base + m;
  const local = new LocalSituationInterpreter().evaluate(samples, now);
  assert.notEqual(local.action, 'wait');
  const input = metaInput(samples, now, local)!;
  const latestIds = input.facts.filter((f) => f.observedAt === input.observedAt).slice(0, 2).map((f) => f.id);
  const body = { scenario: 'video', action: 'wait', title: '看起來正在看影片', reason: '前景影音與播放線索連續出現。', evidenceIds: latestIds, alternatives: [], gaps: [] };
  const r = await new MetaApi(config(), async () => reply(body)).infer(input, now);
  assert.equal(r.decision.action, 'wait');
});

test('Meta outing question is generic, not the revisit/low-battery template', () => {
  const q = metaOutingQuestion('看起來正在外出');
  assert.equal(q.topic, 'outing');
  assert.equal(q.prompt, '看起來正在外出，現在還順利嗎？');
  assert.ok(!q.prompt.includes('重複經過'));
  assert.ok(!q.prompt.includes('快沒電'));
  assert.ok(q.options.some((o) => o.intent === 'needs_contact'));
  assert.ok(q.options.some((o) => o.intent === 'clarify'));
});

test('Secretary tick: wild Meta confirm creates a case with the generic Meta question', async () => {
  let now = base;
  const store = new CareStore(':memory:', () => now);
  const person = store.selfEnroll({ displayName: 'Ken', requestId: randomUUID() });
  try {
    for (const s of wildSamples()) {
      now = s.at;
      store.ingest(person.deviceToken, { kind: 'context', eventId: s.id, observedAt: s.at, context: s.context });
    }
    now = base + 8 * m;
    store.secretary.tick();
    assert.equal(store.secretary.view(person.personId).outing, null);
    const api = new MetaApi(config(), async (_url, options) => {
      const body = JSON.parse(String(options!.body));
      const user = JSON.parse(body.messages[1].content);
      const latest = user.facts.filter((f: { observedAt: number }) => f.observedAt === user.observedAt).slice(0, 2).map((f: { id: string }) => f.id);
      return reply({ scenario: 'outing', action: 'confirm', title: '看起來正在外出', reason: '導航與移動線索同時出現。', evidenceIds: latest, alternatives: [], gaps: [] });
    });
    store.secretary.model = new MetaSecretary(store, config(), api);
    await store.secretary.model.tick();
    assert.equal(store.secretary.decision(person.personId).source, 'meta');
    assert.equal(store.secretary.decision(person.personId).action, 'confirm');
    store.secretary.tick();
    const view = store.secretary.view(person.personId);
    assert.ok(view.outing);
    const q = store.get('SELECT * FROM questions WHERE id=?', view.outing!.questionId)!;
    assert.equal(q.prompt, '看起來正在外出，現在還順利嗎？');
  } finally { store.close(); }
});

test('ELSE review parses clarified / needs_contact / pending and rejects bad shapes', async () => {
  const api = new MetaApi(config(), async () => replyElse({ review: 'clarified', summary: '本人說在附近散步，不需要協助。' }));
  const out = await api.reviewElse({ prompt: '現在還順利嗎？', options: [{ label: '我還在逛' }], elseText: '我在附近散步，沒事' });
  assert.equal(out.review, 'clarified');
  assert.equal(out.summary, '本人說在附近散步，不需要協助。');
  for (const bad of [{ review: 'maybe', summary: 'x' }, { review: 'clarified', summary: '' }, { review: 'clarified', summary: '本人已確認平安' }]) {
    await assert.rejects(new MetaApi(config(), async () => replyElse(bad)).reviewElse({ prompt: 'p', options: [], elseText: 't' }), /invalid_output/);
  }
});

function elseFixture() {
  const elseBase = Date.parse('2026-10-27T09:59:00Z');
  let now = elseBase;
  const s = new CareStore(':memory:', () => now);
  const { identity } = s.createWorkspace({ kind: 'personal', label: '測試', caregiverName: '家人', timezone: 'UTC' });
  const pair = s.createPairing(identity, { displayName: '媽媽' });
  const phone = s.enroll({ code: pair.code, requestId: randomUUID() });
  s.flow.setPlan(identity, phone.personId, { enabled: true, graceMinutes: 1, responseMinutes: 2, deferMinutes: 3, cooldownMinutes: 60 });
  const at = (minutes: number) => { now = elseBase + minutes * m; return now; };
  const event = (kind: string, data: Record<string, unknown> = {}) => s.ingest(phone.deviceToken, { eventId: randomUUID(), kind, observedAt: now, ...data });
  const convenient = () => event('context', { context: { batteryPercent: 80, charging: false, network: 'online', screenInteractive: true, ringer: 'normal', motion: 'unknown', location: null, notifications: [], sharing: 'summary' } });
  const question = () => s.deviceStatus(phone.deviceToken).question!;
  const ask = () => { convenient(); s.flow.tick(); at(1); s.flow.tick(); return question(); };
  const answerElse = (text: string) => event('question_answer', { questionId: question().id, optionId: 'else', elseText: text });
  return { s, identity, phone, question, ask, answerElse };
}

test('ELSE: Meta 說已釐清時，escalate 的關心與提醒會被收回，原話還在', async () => {
  const f = elseFixture();
  try {
    const q = f.ask();
    f.answerElse('我在附近散步，沒事');
    assert.equal(f.s.flow.runView(f.phone.personId)!.state, 'escalated');
    assert.equal(f.s.flow.alerts(f.identity).length, 1);
    assert.equal(f.s.flow.alerts(f.identity)[0].resolvedAt, null);
    f.s.metaElseReviewer = async () => ({ review: 'clarified', summary: '本人說在附近散步，不需要協助。' });
    const out = await f.s.applyMetaElseReview(q.id);
    assert.deepEqual(out, { review: 'clarified', summary: '本人說在附近散步，不需要協助。' });
    const answer = JSON.parse(f.s.get('SELECT * FROM questions WHERE id=?', q.id)!.answer_json);
    assert.equal(answer.review, 'clarified');
    assert.equal(answer.elseText, '我在附近散步，沒事');
    assert.equal(answer.metaElseSummary, '本人說在附近散步，不需要協助。');
    assert.equal(f.s.flow.runView(f.phone.personId)!.state, 'clarified');
    assert.ok(f.s.flow.alerts(f.identity)[0].resolvedAt);
  } finally { f.s.close(); }
});

test('ELSE: Meta 說 pending 時什麼都不動，求助不會被吃掉', async () => {
  const f = elseFixture();
  try {
    const q = f.ask();
    f.answerElse('嗯……不太確定');
    assert.equal(f.s.flow.runView(f.phone.personId)!.state, 'escalated');
    f.s.metaElseReviewer = async () => ({ review: 'pending', summary: '補充無法釐清。' });
    assert.equal(await f.s.applyMetaElseReview(q.id), null);
    const answer = JSON.parse(f.s.get('SELECT * FROM questions WHERE id=?', q.id)!.answer_json);
    assert.equal(answer.review, 'pending');
    assert.equal(f.s.flow.runView(f.phone.personId)!.state, 'escalated');
  } finally { f.s.close(); }
});

test('ELSE: Meta 說需要聯絡時，會立求助旗標，但原來的提醒不被消掉', async () => {
  const f = elseFixture();
  try {
    const q = f.ask();
    f.answerElse('我找不到路，請家人打給我');
    f.s.metaElseReviewer = async () => ({ review: 'needs_contact', summary: '本人說找不到路，請家人聯絡。' });
    const out = await f.s.applyMetaElseReview(q.id);
    assert.equal(out!.review, 'needs_contact');
    const answer = JSON.parse(f.s.get('SELECT * FROM questions WHERE id=?', q.id)!.answer_json);
    assert.equal(answer.review, 'needs_contact');
    const person = f.s.get('SELECT * FROM people WHERE id=?', f.phone.personId)!;
    assert.ok(person.help_id);
    assert.equal(f.s.flow.alerts(f.identity)[0].resolvedAt, null);
  } finally { f.s.close(); }
});

test('metaInput 帶聚合線索：有移動距離、無座標、簽名隨聚合改變', () => {
  const samples = wildSamples(), now = base + 8 * m;
  const local = new LocalSituationInterpreter().evaluate(samples, now);
  const input = metaInput(samples, now, local)!;
  const agg = input.facts.find((f) => f.label.includes('聚合線索'));
  assert.ok(agg);
  assert.ok(!agg!.label.includes('25.'));
  assert.ok(!agg!.label.includes('121'));
  assert.match(agg!.label, /移動距離下限約 [1-9]/);
  assert.match(agg!.label, /導航持續觀測約 8 分鐘/);
  const moved = wildSamples().map((s, i) => i === 8 ? { ...s, context: { ...s.context, location: { latitude: 26, longitude: 121, accuracy: 10, observedAt: s.at } } } : s);
  const input2 = metaInput(moved, now, local)!;
  assert.notEqual(input2.signature, input.signature);
});
