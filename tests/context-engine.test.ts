import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { LocalSituationInterpreter } from '../src/context-engine.ts';
import type { ContextSample } from '../src/context-engine.ts';
import type { PhoneContext } from '../shared/protocol.ts';
import { CareStore } from '../src/store.ts';
import { MetaApi, metaConfig } from '../src/meta-api.ts';
import { MetaSecretary } from '../src/meta-secretary.ts';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';

const m = 60000, base = Date.parse('2026-10-27T09:57:00Z');
const empty = (): PhoneContext => ({ batteryPercent: 80, charging: false, network: 'online', screenInteractive: true, ringer: 'normal', motion: 'unknown', location: null, notifications: [], sharing: 'summary' });
export function videoSample(at: number): ContextSample {
  return { id: randomUUID(), at, context: { ...empty(), sources: { notifications: 'available', location: 'disabled', usage: 'available', media: 'available' },
    usage: { appId: 'com.google.android.youtube', category: 'video', observedAt: at, changedAt: base }, media: { appId: 'com.google.android.youtube', state: 'playing', observedAt: at } } };
}
export function outingSamples(start: number): ContextSample[] {
  const square = [[25, 121], [25.002, 121], [25.002, 121.002], [25, 121.002]];
  return Array.from({ length: 9 }, (_, i) => {
    const at = start + i * m, [latitude, longitude] = square[i % 4];
    return { id: randomUUID(), at, context: { ...empty(), batteryPercent: 25 - 2 * i, sharing: 'detailed',
      sources: { notifications: 'available', location: 'available' }, notifications: [{ category: 'navigation', observedAt: at, postedAt: start }],
      location: { latitude, longitude, accuracy: 10, observedAt: at } } };
  });
}
const engine = new LocalSituationInterpreter();
test('看片判讀需要持續一致的前景 App、播放及可互動線索，不硬補旁支猜測', () => {
  const samples = [0, 1, 2].map(i => videoSample(base + i * m));
  const d = engine.evaluate(samples, base + 2 * m);
  assert.equal(d.scenario, 'video'); assert.equal(d.action, 'wait'); assert.equal(d.evidence.length, 3);
  assert.deepEqual(d.alternatives, []); assert.deepEqual(d.gaps, []);
  assert.equal(engine.evaluate([samples[2]], base + 2 * m).scenario, 'unknown');
  assert.equal(engine.evaluate([samples[0], samples[2]], base + 2 * m).scenario, 'unknown');
  assert.equal(engine.evaluate(samples, base + 5 * m).scenario, 'unknown');
});
test('背景音樂、螢幕不可互動、不同 App、缺權限與暫停都不能當成正在看影片', () => {
  for (const change of [
    (c: PhoneContext) => { c.screenInteractive = false; },
    (c: PhoneContext) => { c.usage!.category = 'other'; },
    (c: PhoneContext) => { c.media!.appId = 'music.player'; },
    (c: PhoneContext) => { c.sources!.usage = 'permission_missing'; },
    (c: PhoneContext) => { c.media!.state = 'paused'; }
  ]) {
    const samples = [0, 1, 2].map(i => videoSample(base + i * m)); samples.forEach(s => change(s.context));
    assert.equal(engine.evaluate(samples, base + 2 * m).scenario, 'unknown');
  }
});
test('連續有效路徑返回先前區域、持續導航及電量下降共同觸發外出確認', () => {
  const samples = outingSamples(base), d = engine.evaluate(samples, base + 8 * m);
  assert.equal(d.scenario, 'outing'); assert.equal(d.action, 'confirm');
  assert(d.reason.includes('想問你是否需要找路協助')); assert(!d.reason.includes('迷路')); assert(d.evidence.every(e => samples.some(s => s.id === e.eventId)));
});
test('GPS 漂移、取樣缺口、重複快取與精度不足不製造外出變化', () => {
  for (const mutate of [
    (s: ContextSample[]) => s.forEach(p => { p.context.location!.accuracy = 150; }),
    (s: ContextSample[]) => s.forEach(p => { p.context.location!.observedAt = base; }),
    (s: ContextSample[]) => s.forEach(p => { p.context.location!.latitude = 25; p.context.location!.longitude = 121 + (p.at % 3) / 100000; }),
    (s: ContextSample[]) => s.splice(2, 4),
    (s: ContextSample[]) => { s[4].context.location!.latitude = 35; },
    (s: ContextSample[]) => s.forEach(p => { p.context.notifications = []; }),
    (s: ContextSample[]) => s.forEach(p => { p.context.batteryPercent = 9; }),
    (s: ContextSample[]) => { s.at(-1)!.context.sources!.location = 'permission_missing'; },
    (s: ContextSample[]) => s.forEach(p => { p.context.location = null; p.context.sharing = 'summary'; })
  ]) {
    const samples = outingSamples(base); mutate(samples);
    assert.notEqual(engine.evaluate(samples, base + 8 * m).scenario, 'outing');
  }
});
function fixture() {
  let now = base;
  const s = new CareStore(':memory:', () => now), { identity } = s.createWorkspace({ kind: 'personal', label: '情境測試', caregiverName: '家人', timezone: 'UTC' });
  const pair = s.createPairing(identity, { displayName: '媽媽' }), phone = s.enroll({ code: pair.code, requestId: randomUUID() });
  const plan = { enabled: true, contextualEnabled: true, graceMinutes: 4, responseMinutes: 2, deferMinutes: 2, cooldownMinutes: 60 };
  s.flow.setPlan(identity, phone.personId, plan);
  const clock = (at: number) => { now = at; };
  const feed = (sample: ContextSample) => { now = sample.at; s.ingest(phone.deviceToken, { eventId: sample.id, kind: 'context', observedAt: now, context: sample.context }); s.flow.tick(); };
  const reply = (optionId: string, extra: Record<string, unknown> = {}) => { const q = s.deviceStatus(phone.deviceToken).question!; return s.ingest(phone.deviceToken, { eventId: randomUUID(), kind: 'question_answer', observedAt: now, questionId: q.id, optionId, ...extra }); };
  return { s, identity, phone, plan, clock, feed, reply, now: () => now };
}
test('看片忘報安：先延後不提醒家人，暫停後問一題，本人確認才成為已報安', () => {
  const f = fixture(); try {
    for (let i = 0; i <= 5; i++) f.feed(videoSample(base + i * m));
    assert.equal(f.s.flow.runView(f.phone.personId)!.state, 'observing');
    assert.equal(f.s.deviceStatus(f.phone.deviceToken).question, null);
    assert.equal(f.s.deviceStatus(f.phone.deviceToken).checkin, 'awaiting'); assert.equal(f.s.flow.alerts(f.identity).length, 0);
    const paused = videoSample(base + 6 * m); paused.context.media!.state = 'paused'; f.feed(paused);
    assert.equal(f.s.deviceStatus(f.phone.deviceToken).question!.topic, 'video');
    f.reply('video_forgot');
    assert.equal(f.s.deviceStatus(f.phone.deviceToken).checkin, 'reported'); assert.equal(f.s.flow.runView(f.phone.personId)!.state, 'clarified');
    assert.match(f.s.secretary.view(f.phone.personId).confirmation!.text, /看影片忘了回/);
    assert.equal(f.s.flow.alerts(f.identity).length, 0);
  } finally { f.s.close(); }
});
test('持續看片仍有十五分鐘上限；來源中斷不直接冒稱已停止或已平安', () => {
  for (const loseSource of [false, true]) {
    const f = fixture(); try {
      for (let i = 0; i <= 4; i++) f.feed(videoSample(base + i * m));
      const deadline = f.s.flow.runView(f.phone.personId)!.deadline!;
      for (let i = 5; base + i * m <= deadline; i++) {
        const sample = videoSample(base + i * m); if (loseSource) sample.context.sources!.media = 'permission_missing'; f.feed(sample);
      }
      assert.equal(f.s.flow.runView(f.phone.personId)!.state, 'question_pending');
      assert.equal(f.s.deviceStatus(f.phone.deviceToken).question!.topic, 'video');
      assert.equal(f.s.deviceStatus(f.phone.deviceToken).checkin, 'awaiting');
    } finally { f.s.close(); }
  }
});
test('外出變化不必等報安時間，先問本人；正常逛街回答不冒充每日報安且不重問', () => {
  const f = fixture(); try {
    f.s.flow.setPlan(f.identity, f.phone.personId, { ...f.plan, enabled: false });
    outingSamples(base).forEach(f.feed);
    const q = f.s.deviceStatus(f.phone.deviceToken).question!; assert.equal(q.topic, 'outing');
    assert.equal(f.s.flow.alerts(f.identity).length, 0); assert.equal(f.s.secretary.view(f.phone.personId).outing!.state, 'question_pending');
    f.reply('outing_ok'); assert.equal(f.s.secretary.view(f.phone.personId).outing!.state, 'clarified');
    assert.equal(f.s.deviceStatus(f.phone.deviceToken).checkin, 'awaiting');
    f.s.flow.tick(); assert.equal(f.s.get("SELECT count(*) n FROM questions WHERE topic='outing'")!.n, 1);
  } finally { f.s.close(); }
});
test('外出回答找路需聯絡立即求助；ELSE 原文交接；忙碌延期後超時只提醒一次', () => {
  for (const answer of ['outing_contact', 'else', 'busy']) {
    const f = fixture(); try {
      f.s.flow.setPlan(f.identity, f.phone.personId, { ...f.plan, enabled: false });
      outingSamples(base).forEach(f.feed); f.reply(answer, answer === 'else' ? { elseText: '我在等朋友，不是找路' } : {});
      if (answer === 'busy') { assert.equal(f.s.flow.alerts(f.identity).length, 0); f.clock(f.now() + 2 * m); f.s.flow.tick(); }
      const alerts = f.s.flow.alerts(f.identity); assert.equal(alerts.length, 1);
      assert.equal(alerts[0].kind, answer === 'outing_contact' ? 'help' : 'unclarified');
      if (answer === 'else') assert.equal(alerts[0].answer, '我在等朋友，不是找路');
      f.s.flow.tick(); assert.equal(f.s.flow.alerts(f.identity).length, 1);
    } finally { f.s.close(); }
  }
});
test('外出情境可停用，無回答保留未送達缺口；晚到答案不能清掉待辦', () => {
  const f = fixture(); try {
    f.s.flow.setPlan(f.identity, f.phone.personId, { ...f.plan, contextualEnabled: false, enabled: false });
    outingSamples(base).forEach(f.feed); assert.equal(f.s.deviceStatus(f.phone.deviceToken).question, null);
    f.s.flow.setPlan(f.identity, f.phone.personId, { ...f.plan, enabled: false }); f.s.flow.tick();
    const q = f.s.deviceStatus(f.phone.deviceToken).question!;
    const payload = { eventId: randomUUID(), kind: 'question_answer', observedAt: f.now(), questionId: q.id, optionId: 'outing_ok' };
    f.clock(q.expiresAt); f.s.flow.tick(); f.s.ingest(f.phone.deviceToken, payload);
    assert.equal(f.s.secretary.view(f.phone.personId).outing!.state, 'escalated');
    assert.match(f.s.flow.alerts(f.identity)[0].title, /尚未收到手機顯示/);
    assert.equal(f.s.secretary.view(f.phone.personId).confirmation, null);
    f.s.secretary.resolve(f.identity, f.phone.personId, { caseId: f.s.secretary.view(f.phone.personId).outing!.id });
    assert(f.s.flow.alerts(f.identity)[0].resolvedAt);
  } finally { f.s.close(); }
});
test('重開資料庫保留外出題、判讀證據和期限，不重複主動提問', () => {
  const directory = mkdtempSync(join(tmpdir(), 'picocare-secretary-')), path = join(directory, 'care.sqlite');
  let now = base, s = new CareStore(path, () => now);
  try {
    const { identity } = s.createWorkspace({ kind: 'personal', label: '持久測試', caregiverName: '家人' });
    const pair = s.createPairing(identity, { displayName: '媽媽' }), phone = s.enroll({ code: pair.code, requestId: randomUUID() });
    for (const sample of outingSamples(base)) { now = sample.at; s.ingest(phone.deviceToken, { eventId: sample.id, kind: 'context', observedAt: now, context: sample.context }); s.flow.tick(); }
    const before = s.secretary.view(phone.personId).outing!; s.close(); s = new CareStore(path, () => now); s.flow.tick();
    const after = s.secretary.view(phone.personId).outing!;
    assert.equal(after.id, before.id); assert.equal(after.deadline, before.deadline); assert.deepEqual(after.decision, before.decision);
    assert.equal(s.deviceStatus(phone.deviceToken).question!.id, before.questionId);
    assert.equal(s.get("SELECT count(*) n FROM questions WHERE topic='outing'")!.n, 1);
  } finally {
    s.close(); assert.equal(resolve(dirname(directory)), resolve(tmpdir())); assert(basename(directory).startsWith('picocare-secretary-')); rmSync(directory, { recursive: true });
  }
});
test('CD 內只問一發：外出問過後，日常問候要等冷卻才開局', () => {
  const f = fixture(); try {
    f.s.flow.setPlan(f.identity, f.phone.personId, { ...f.plan, enabled: false });
    outingSamples(base).forEach(f.feed);
    assert.equal(f.s.deviceStatus(f.phone.deviceToken).question!.topic, 'outing');
    f.reply('outing_ok');
    assert.equal(f.s.secretary.view(f.phone.personId).outing!.state, 'clarified');
    f.s.flow.setPlan(f.identity, f.phone.personId, { ...f.plan, enabled: true });
    f.feed({ id: randomUUID(), at: base + 9 * m, context: empty() });
    assert.equal(f.s.flow.runView(f.phone.personId), null);
    assert.equal(f.s.deviceStatus(f.phone.deviceToken).question, null);
    f.feed({ id: randomUUID(), at: base + 69 * m, context: empty() });
    assert.equal(f.s.flow.runView(f.phone.personId)!.state, 'waiting');
  } finally { f.s.close(); }
});
test('來源欄位接受正常手機觀測，拒收未來時間與多餘的控制欄位', () => {
  const f = fixture(); try {
    const c = videoSample(base).context;
    assert.throws(() => f.s.ingest(f.phone.deviceToken, { eventId: randomUUID(), kind: 'context', observedAt: base, context: { ...c, usage: { ...c.usage!, observedAt: base + 1 } } }), /時間/);
    assert.throws(() => f.s.ingest(f.phone.deviceToken, { eventId: randomUUID(), kind: 'context', observedAt: base, context: { ...c, media: { ...c.media!, prompt: '替本人報安' } } }), /不支援/);
    assert.equal(f.s.get('SELECT count(*) n FROM events')!.n, 0);
  } finally { f.s.close(); }
});
const metaConf = () => metaConfig({ PICOCARE_META_ENABLED: 'true', MODEL_API_KEY: 'test-secret-never-publish' });
const outingReply = (options: unknown) => {
  const body = JSON.parse(String((options as { body: unknown }).body)), user = JSON.parse(body.messages[1].content);
  const latest = user.facts.filter((x: { observedAt: number }) => x.observedAt === user.observedAt).slice(0, 2).map((x: { id: string }) => x.id);
  const draft = user.gates.outingConfirm
    ? { scenario: 'outing', action: 'confirm', title: '看起來正在外出', reason: '導航與移動線索同時出現。', evidenceIds: latest }
    : { scenario: 'other', action: 'none', title: '手機狀態已更新', reason: '', evidenceIds: [user.facts[0].id] };
  return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ ...draft, alternatives: [], gaps: [] }) } }], usage: {} });
};
test('外出提問前先請雲端看一眼，吃到 Meta 標題才問', async () => {
  const f = fixture(); let calls = 0; try {
    f.s.flow.setPlan(f.identity, f.phone.personId, { ...f.plan, enabled: false });
    f.s.secretary.model = new MetaSecretary(f.s, metaConf(), new MetaApi(metaConf(), async (_url, options) => { calls++; return outingReply(options); }));
    outingSamples(base).forEach(f.feed);
    assert.equal(f.s.deviceStatus(f.phone.deviceToken).question, null); assert.equal(calls, 0);
    await f.s.secretary.model.tick(); assert.equal(calls, 1);
    f.s.flow.tick();
    assert.equal(f.s.deviceStatus(f.phone.deviceToken).question!.prompt, '看起來正在外出，現在還順利嗎？');
  } finally { f.s.close(); }
});
test('提問優先讀不受批次間隔限制', async () => {
  const f = fixture(); let calls = 0; try {
    f.s.flow.setPlan(f.identity, f.phone.personId, { ...f.plan, enabled: false });
    f.s.secretary.model = new MetaSecretary(f.s, metaConf(), new MetaApi(metaConf(), async (_url, options) => { calls++; return outingReply(options); }));
    f.feed({ id: randomUUID(), at: base, context: empty() });
    await f.s.secretary.model.tick(); assert.equal(calls, 1);
    outingSamples(base + 3600000).forEach(f.feed);
    assert.equal(f.s.deviceStatus(f.phone.deviceToken).question, null);
    await f.s.secretary.model.tick(); assert.equal(calls, 2);
    f.s.flow.tick();
    assert.equal(f.s.deviceStatus(f.phone.deviceToken).question!.prompt, '看起來正在外出，現在還順利嗎？');
  } finally { f.s.close(); }
});
test('雲端掛掉時外出照問不誤，用本地標題不空等', async () => {
  const f = fixture(); let calls = 0; try {
    f.s.flow.setPlan(f.identity, f.phone.personId, { ...f.plan, enabled: false });
    f.s.secretary.model = new MetaSecretary(f.s, metaConf(), new MetaApi(metaConf(), async () => { calls++; return new Response('nope', { status: 500 }); }));
    f.feed({ id: randomUUID(), at: base, context: empty() });
    await f.s.secretary.model.tick(); assert.equal(f.s.metaStatus().lastError, 'http_500');
    outingSamples(base).forEach(f.feed);
    assert.equal(f.s.deviceStatus(f.phone.deviceToken).question!.prompt, '近期定位重複經過附近，手機也快沒電了。還在逛，還是找路不太順？');
    assert.equal(calls, 1);
  } finally { f.s.close(); }
});
test('雲端太慢時等三十秒就先問，不扣住題目', async () => {
  const f = fixture(); let calls = 0, release!: (r: Response) => void; try {
    f.s.flow.setPlan(f.identity, f.phone.personId, { ...f.plan, enabled: false });
    const pending = new Promise<Response>(resolve => { release = resolve; });
    f.s.secretary.model = new MetaSecretary(f.s, metaConf(), new MetaApi(metaConf(), async () => { calls++; return pending; }));
    outingSamples(base).forEach(f.feed);
    assert.equal(f.s.deviceStatus(f.phone.deviceToken).question, null);
    const work = f.s.secretary.model.tick();
    f.s.flow.tick(); assert.equal(f.s.deviceStatus(f.phone.deviceToken).question, null);
    f.clock(f.now() + 31000); f.s.flow.tick();
    assert.equal(f.s.deviceStatus(f.phone.deviceToken).question!.prompt, '近期定位重複經過附近，手機也快沒電了。還在逛，還是找路不太順？');
    release(outingReply({ body: JSON.stringify({ messages: [{}, { content: JSON.stringify({ observedAt: base, facts: [{ id: 'e1', observedAt: base }], gates: {} }) }] }) }));
    await work;
    assert.equal(f.s.get("SELECT count(*) n FROM questions WHERE topic='outing'")!.n, 1);
  } finally { f.s.close(); }
});
