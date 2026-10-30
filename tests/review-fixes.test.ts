import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { CareStore, sessionLifetime } from '../src/store.ts';
import { localQuestion } from '../src/questions.ts';
import { metaConfig, MetaApi, metaInput, basetenBaseUrl } from '../src/meta-api.ts';
import { MetaSecretary } from '../src/meta-secretary.ts';
import { LocalSituationInterpreter } from '../src/context-engine.ts';
import type { ContextSample } from '../src/context-engine.ts';
import type { PhoneContext } from '../shared/protocol.ts';
import { makeServer } from '../src/server.ts';

const base = Date.parse('2026-10-30T08:00:00+08:00'), minute = 60000;
const context = (): PhoneContext => ({ batteryPercent: 80, charging: false, network: 'online', screenInteractive: true,
  ringer: 'normal', motion: 'unknown', location: null, notifications: [], sharing: 'summary' });
function fixture() {
  let now = base;
  const s = new CareStore(':memory:', () => now);
  const { identity, session } = s.createWorkspace({ label: 'Family', kind: 'personal', caregiverName: 'Family' });
  const pair = s.createPairing(identity, { displayName: 'Parent' });
  const phone = s.enroll({ code: pair.code, requestId: randomUUID() });
  const event = (kind: string, more: object = {}) => s.ingest(phone.deviceToken, { eventId: randomUUID(), kind, observedAt: now, ...more });
  const ask = () => {
    s.flow.setPlan(identity, phone.personId, { enabled: true, contextualEnabled: true, graceMinutes: 1, responseMinutes: 2, deferMinutes: 3, cooldownMinutes: 60 });
    event('context', { context: context() }); s.flow.tick(); now += minute; s.flow.tick();
    return s.deviceStatus(phone.deviceToken).question!;
  };
  return { s, identity, session, phone, event, ask, advance: (ms: number) => now += ms, now: () => now };
}

test('caregiver session renews with use; recovery reopens same people and denies wrong code', () => {
  const f = fixture();
  try {
    const recoveryCode = f.s.recoveryCode(f.identity);
    f.advance(86400001); assert.equal(f.s.identity(f.session).workspaceId, f.identity.workspaceId);
    f.advance(sessionLifetime - minute); assert.equal(f.s.identity(f.session).workspaceId, f.identity.workspaceId);
    f.advance(sessionLifetime + 1); assert.throws(() => f.s.identity(f.session), (e: any) => e.status === 401);
    assert.throws(() => f.s.restoreSession({ recoveryCode: 'wrong-code' }), (e: any) => e.status === 401);
    const restored = f.s.restoreSession({ recoveryCode });
    assert.equal(restored.identity.workspaceId, f.identity.workspaceId);
    assert.equal(f.s.list(restored.identity).people[0].id, f.phone.personId);
    assert.equal(f.s.device(f.phone.deviceToken).id, f.phone.personId);
  } finally { f.s.close(); }
});

test('self-mode links to caregiver with same person, token, evidence, help and plan; retries stay idempotent', () => {
  const f = fixture();
  try {
    const requestId = randomUUID(), self = f.s.selfEnroll({ displayName: 'Ken', requestId });
    const oldWorkspace = f.s.device(self.deviceToken).workspace_id;
    f.s.ingest(self.deviceToken, { eventId: randomUUID(), kind: 'help', observedAt: f.now() });
    f.s.selfPlan(self.deviceToken, { enabled: true, graceMinutes: 3, responseMinutes: 4, deferMinutes: 5 });
    const code = f.s.createPairing(f.identity, { displayName: 'Ken' }).code, linkRequest = randomUUID();
    assert.throws(() => f.s.linkCaregiver(undefined, { code, requestId: linkRequest }), (e: any) => e.status === 401);
    const linked = f.s.linkCaregiver(self.deviceToken, { code, requestId: linkRequest });
    assert.equal(linked.personId, self.personId); assert.equal(linked.deviceToken, self.deviceToken);
    assert.equal(linked.caregiverConnected, true);
    assert.equal(f.s.deviceStatus(self.deviceToken).helpOpen, true);
    assert.equal(f.s.flow.plan(self.personId).graceMinutes, 3);
    assert.equal(f.s.detail(f.identity, self.personId).timeline.length, 1);
    assert.equal(f.s.flow.alerts(f.identity).filter(a => a.personId === self.personId).length, 1);
    assert.notEqual(oldWorkspace, f.identity.workspaceId);
    assert.equal(f.s.get('SELECT COUNT(*) n FROM events WHERE person_id=?', self.personId)!.n, 1);
    f.advance(11 * minute);
    assert.deepEqual(f.s.linkCaregiver(self.deviceToken, { code, requestId: linkRequest }), linked);
    assert.equal(f.s.selfEnroll({ displayName: 'Ken', requestId }).enrollmentMode, 'paired');
    const other = f.s.createWorkspace({ label: 'Other', kind: 'personal', caregiverName: 'Other' }).identity;
    assert.throws(() => f.s.detail(other, self.personId), (e: any) => e.status === 404);
    assert.throws(() => f.s.linkCaregiver(self.deviceToken, { code: f.s.createPairing(other, { displayName: 'X' }).code, requestId: randomUUID() }), (e: any) => e.status === 409);
  } finally { f.s.close(); }
});

test('late ELSE cannot withdraw an escalated alert or spend a review call', async () => {
  const f = fixture(); let calls = 0;
  try {
    const q = f.ask(); f.advance(3 * minute); f.s.flow.tick();
    f.event('question_answer', { questionId: q.id, optionId: 'else', elseText: 'I was walking.' });
    await f.s.applyMetaElseReview(q.id, async () => { calls++; return { review: 'clarified', summary: 'Walking.' }; });
    assert.equal(calls, 0);
    assert.equal(f.s.flow.runView(f.phone.personId)!.state, 'escalated');
    assert.equal(f.s.flow.alerts(f.identity)[0].resolvedAt, null);
    assert.equal(f.s.questionView(f.s.get('SELECT * FROM questions WHERE id=?', q.id)!).status, 'answered_late');
  } finally { f.s.close(); }
});

test('delayed ELSE cannot reopen a help request resolved by caregiver', async () => {
  const f = fixture();
  try {
    const q = f.s.ask(f.phone.personId, localQuestion(null, null, f.now()));
    f.event('question_answer', { questionId: q.id, optionId: 'else', elseText: 'Call me.' });
    let release!: (v: any) => void;
    const pending = f.s.applyMetaElseReview(q.id, () => new Promise(resolve => { release = resolve; }));
    f.event('help');
    const p = f.s.detail(f.identity, f.phone.personId).person;
    f.s.contact(f.identity, f.phone.personId, { outcome: 'help_resolved', revision: p.revision, helpEventId: p.helpEventId });
    release({ review: 'needs_contact', summary: 'Contact requested.' });
    assert.equal(await pending, null);
    assert.equal(f.s.deviceStatus(f.phone.deviceToken).helpOpen, false);
    assert.equal(f.s.flow.alerts(f.identity).filter(a => !a.resolvedAt).length, 0);
  } finally { f.s.close(); }
});

test('ELSE contact result creates a help alert once and retains original time and words', async () => {
  const f = fixture();
  try {
    const q = f.ask(), at = f.now();
    f.event('question_answer', { questionId: q.id, optionId: 'else', elseText: 'Please call me.' });
    f.advance(1000);
    const review = async () => ({ review: 'needs_contact' as const, summary: 'Contact requested.' });
    await f.s.applyMetaElseReview(q.id, review); await f.s.applyMetaElseReview(q.id, review);
    const alerts = f.s.flow.alerts(f.identity).filter(a => a.kind === 'help');
    assert.equal(alerts.length, 1); assert.equal(alerts[0].answer, 'Please call me.');
    assert.equal(f.s.detail(f.identity, f.phone.personId).person.helpAt, at);
    assert.equal(alerts[0].resolvedAt, null);
  } finally { f.s.close(); }
});

test('background context arriving during ELSE review does not invalidate a fresh answer', async () => {
  const f = fixture();
  try {
    const q = f.ask(); f.event('question_answer', { questionId: q.id, optionId: 'else', elseText: 'Taking a walk, no help needed.' });
    let release!: (v: any) => void;
    const pending = f.s.applyMetaElseReview(q.id, () => new Promise(resolve => { release = resolve; }));
    f.advance(30000); f.event('context', { context: context() });
    release({ review: 'clarified', summary: 'Taking a walk.' });
    assert.equal((await pending)!.review, 'clarified');
    assert.equal(f.s.flow.runView(f.phone.personId)!.state, 'clarified');
  } finally { f.s.close(); }
});

test('daily notes include sample 501 and retain the earlier morning note', () => {
  const f = fixture();
  try {
    for (let i = 0; i < 500; i++) { f.event('context', { context: context() }); f.advance(30000); }
    f.event('context', { context: { ...context(), batteryPercent: 8 } }); f.s.secretary.notes.tick(f.phone.personId);
    const notes = f.s.secretary.notes.recent(f.phone.personId);
    assert.ok(notes.some(n => n.kind === 'battery' && n.body.includes('8')));
    assert.ok(notes.some(n => n.kind === 'morning'));
  } finally { f.s.close(); }
});

test('poor GPS and one persistent navigation notification do not become travelled metres or repeated prompts', async () => {
  const samples: ContextSample[] = Array.from({ length: 9 }, (_, i) => ({ id: randomUUID(), at: base + i * 30000,
    context: { ...context(), sharing: 'detailed', sources: { location: 'available', notifications: 'available' },
      location: { latitude: 25 + (i % 2 ? 0.0008 : 0), longitude: 121, accuracy: 100, observedAt: base + i * 30000 },
      notifications: [{ category: 'navigation', observedAt: base + i * 30000, postedAt: base }] } }));
  const now = samples.at(-1)!.at, local = new LocalSituationInterpreter().evaluate(samples, now), input = metaInput(samples, now, local)!;
  const agg = input.facts.find(f => f.label.includes('聚合線索'))!.label;
  assert.match(agg, /移動距離下限約 0 公尺/); assert.match(agg, /導航通知 1 筆/); assert.match(agg, /導航持續觀測約 4 分鐘/);
  const c = metaConfig({ PICOCARE_META_ENABLED: 'true', MODEL_API_KEY: 'synthetic' });
  const api = new MetaApi(c, async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
    scenario: 'outing', action: 'confirm', title: 'Outing', reason: '', alternatives: [], gaps: [],
    evidenceIds: input.facts.filter(f => f.observedAt === now).slice(0, 2).map(f => f.id),
  }) } }] }));
  await assert.rejects(api.infer(input, now), /invalid_output/);
});

test('Wi-Fi is advisory: small movement needs stronger evidence while a substantial real outing remains possible', () => {
  const make = (wifi: boolean, span: number): ContextSample[] => [0, 1, 2].map(i => ({ id: randomUUID(), at: base + i * minute,
    context: { ...context(), sharing: 'detailed', sources: { location: 'available', notifications: 'available' },
      location: { latitude: 25 + i * span, longitude: 121, accuracy: 10, observedAt: base + i * minute },
      networkEvidence: { transports: wifi ? ['wifi'] : ['cellular'], observedAt: base + i * minute, changedAt: base - 10 * minute } } }));
  for (const [wifi, span, expected] of [[false, 0.0015, true], [true, 0.0015, false], [true, 0.003, true]] as const) {
    const samples = make(wifi, span), now = samples.at(-1)!.at;
    const input = metaInput(samples, now, new LocalSituationInterpreter().evaluate(samples, now))!;
    assert.equal(input.gates.credibleMovement, expected);
    assert.ok(input.facts.some(f => f.label.includes(wifi ? 'wifi' : 'cellular')));
    assert.ok(!JSON.stringify(input).includes('SSID'));
  }
});

test('network evidence accepts old samples without it and rejects identity collection and future times', () => {
  const f = fixture();
  try {
    f.event('context', { context: context() });
    const net = { transports: ['wifi', 'vpn'], observedAt: f.now(), changedAt: f.now() - 1000000 };
    f.event('context', { context: { ...context(), networkEvidence: net } });
    assert.throws(() => f.event('context', { context: { ...context(), networkEvidence: { ...net, ssid: 'private' } } }));
    assert.throws(() => f.event('context', { context: { ...context(), networkEvidence: { ...net, observedAt: f.now() + 1 } } }));
  } finally { f.s.close(); }
});

test('Baseten 401 leaves official Meta and ELSE available; official Meta failure leaves Baseten available', async () => {
  for (const failedProvider of ['open', 'meta']) {
    const f = fixture(); let metaCalls = 0, openCalls = 0;
    try {
      for (let i = 0; i < 3; i++) f.s.run('INSERT INTO secretary_notes(id,person_id,at,kind,title,body,evidence_json,source,lang) VALUES(?,?,?,?,?,?,?,?,?)',
        randomUUID(), f.phone.personId, f.now() - (i + 1) * minute, 'test-' + i, 'Activity', 'Phone activity.', '[]', 'local_evidence', f.s.lang());
      const c = metaConfig({ PICOCARE_META_ENABLED: 'true', MODEL_API_KEY: 'synthetic-meta', BASENTEN_API_KEY: 'synthetic-open' });
      const reply = (body: object) => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(body) } }] });
      const meta = new MetaApi(c, async (_u, options) => {
        metaCalls++;
        if (failedProvider === 'meta') return new Response('', { status: 401 });
        const user = JSON.parse(JSON.parse(String(options!.body)).messages[1].content);
        if (user.elseText) return reply({ review: 'clarified', summary: 'No help needed.' });
        return reply({ scenario: 'unknown', action: 'none', title: 'Phone screen is on', reason: '', evidenceIds: [user.facts[0].id], alternatives: [], gaps: [] });
      });
      const open = new MetaApi(c, async () => { openCalls++; return failedProvider === 'open' ? new Response('', { status: 401 }) : reply({ text: 'Phone activity was recorded this week.' }); },
        { baseUrl: basetenBaseUrl, key: c.openKey, model: c.openModel, structured: false });
      const worker = new MetaSecretary(f.s, c, meta, open); f.s.secretary.model = worker;
      f.event('context', { context: context() });
      if (failedProvider === 'open') {
        await worker.weeklyTick(); await worker.tick();
        assert.equal(worker.canAttempt(), true);
        assert.equal((await worker.reviewElse({ personId: f.phone.personId, questionId: 'synthetic', prompt: 'How are you?', options: [], elseText: 'No help needed.' }))!.review, 'clarified');
        assert.equal(metaCalls, 2);
      } else {
        await worker.tick(); await worker.weeklyTick();
        assert.equal(openCalls, 1); assert.ok(worker.weekly(f.phone.personId)); assert.equal(worker.canAttempt(), false);
      }
    } finally { f.s.close(); }
  }
});

test('HTTP session restoration and authenticated self-link preserve identity across the real routes', async () => {
  const f = fixture(), server = makeServer(f.s); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string'); const url = `http://127.0.0.1:${address.port}`;
  try {
    const recoveryCode = f.s.recoveryCode(f.identity);
    f.advance(sessionLifetime + 1);
    const response = await fetch(url + '/api/session/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recoveryCode }) });
    assert.equal(response.status, 200); assert.match(response.headers.get('set-cookie')!, /Max-Age=2592000/);
    const cookie = response.headers.get('set-cookie')!.split(';')[0];
    assert.equal((await fetch(url + '/api/people', { headers: { Cookie: cookie } })).status, 200);
    const self = f.s.selfEnroll({ displayName: 'Self', requestId: randomUUID() });
    const code = f.s.createPairing(f.identity, { displayName: 'Self' }).code;
    const body = JSON.stringify({ code, requestId: randomUUID() });
    assert.equal((await fetch(url + '/api/device/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status, 401);
    const linked = await fetch(url + '/api/device/link', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${self.deviceToken}` }, body });
    assert.equal(linked.status, 200); assert.equal((await linked.json()).personId, self.personId);
    const denied = await fetch(url + '/api/session/restore', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://other.example' }, body: JSON.stringify({ recoveryCode }) });
    assert.equal(denied.status, 403);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); f.s.close(); }
});
