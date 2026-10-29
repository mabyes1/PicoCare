import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { CareStore } from '../src/store.ts';
import { MetaApi, basetenBaseUrl, metaConfig } from '../src/meta-api.ts';
import { MetaSecretary } from '../src/meta-secretary.ts';
import type { PhoneContext } from '../shared/protocol.ts';

const m = 60000, day = '2026-10-27';
const at = (clock: string) => Date.parse(`${day}T${clock}:00+08:00`);
const config = () => metaConfig({ PICOCARE_META_ENABLED: 'true', MODEL_API_KEY: 'test-secret-never-publish' });
const reply = (text: string) => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ text }) } }], usage: { prompt_tokens: 500, completion_tokens: 100 } });
function fixture() {
  let now = at('08:00');
  const store = new CareStore(':memory:', () => now);
  const person = store.selfEnroll({ displayName: '媽媽', requestId: randomUUID() });
  const feed = (clock: string, change?: (c: PhoneContext) => void) => {
    now = at(clock);
    const context: PhoneContext = { batteryPercent: 80, charging: false, network: 'online', screenInteractive: true, ringer: 'normal', motion: 'unknown', location: null, notifications: [], sharing: 'summary' };
    change?.(context);
    store.ingest(person.deviceToken, { eventId: randomUUID(), kind: 'context', observedAt: now, context }); store.flow.tick();
  };
  return { store, person, feed, close: () => store.close() };
}
test('動態滿三則就請 Meta 寫本週回顧，內容只用真實動態且同步到手機狀態', async () => {
  const f = fixture(); let requestBody: any, calls = 0;
  try {
    f.feed('08:00');
    for (const c of ['13:00', '13:05', '13:10']) f.feed(c, x => { x.screenInteractive = false; });
    f.feed('13:15', x => { x.screenInteractive = false; x.batteryPercent = 10; });
    assert.ok(f.store.secretary.view(f.person.personId).notes.length >= 3);
    const c = config(), model = new MetaSecretary(f.store, c, new MetaApi(c, async (_url, options) => {
      calls++; requestBody = JSON.parse(String((options!.body as string))); return reply('媽媽這週三天有出門走走，週二晚上看影片看到比較晚。報安都有回，一切穩定。');
    }));
    f.store.secretary.model = model; await model.weeklyTick();
    assert.equal(calls, 1);
    const userContent = JSON.parse(requestBody.messages[1].content);
    assert.equal(userContent.personName, '媽媽'); assert.ok(userContent.notes.length >= 3);
    assert.ok(userContent.notes.some((n: any) => n.title.includes('第一次看到你用手機')));
    assert.ok(!JSON.stringify(requestBody).includes('25.'));
    const weekly = f.store.secretary.view(f.person.personId).weekly!;
    assert.match(weekly.text, /出門走走/); assert.equal(weekly.model, c.model);
    assert.match(f.store.deviceStatus(f.person.deviceToken).secretary.weekly!.text, /出門走走/);
    await model.weeklyTick(); assert.equal(calls, 1);
    model.close();
  } finally { f.close(); }
});
test('動態不足三則不花錢請 Meta，七天內不重寫', async () => {
  const f = fixture(); let calls = 0;
  try {
    f.feed('08:00'); f.feed('08:05');
    const c = config(), model = new MetaSecretary(f.store, c, new MetaApi(c, async () => { calls++; return reply('x'); }));
    f.store.secretary.model = model; await model.weeklyTick();
    assert.equal(calls, 0); assert.equal(model.weekly(f.person.personId), null);
    model.close();
  } finally { f.close(); }
});
test('有 Baseten key 就走開源模型，不送 structured-output 參數，markdown 包的 JSON 也吞得下', async () => {
  const f = fixture(); let url = '', requestBody: any, metaCalls = 0;
  try {
    f.feed('08:00');
    for (const c of ['13:00', '13:05', '13:10']) f.feed(c, x => { x.screenInteractive = false; });
    f.feed('13:15', x => { x.screenInteractive = false; x.batteryPercent = 10; });
    const c = metaConfig({ PICOCARE_META_ENABLED: 'true', MODEL_API_KEY: 'test-secret-never-publish', BASENTEN_API_KEY: 'baseten-test-never-publish', BASENTEN_MODEL: 'muse-spark-open-1026' });
    const meta = new MetaApi(c, async () => { metaCalls++; return reply('unused'); });
    const open = new MetaApi(c, async (u, options) => {
      url = String(u); requestBody = JSON.parse(String(options!.body));
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: '```json\n{"text":"媽媽這週很穩定，有出門也有看影片。"}\n```' } }], usage: { prompt_tokens: 500, completion_tokens: 100 } });
    }, { baseUrl: basetenBaseUrl, key: 'baseten-test-never-publish', model: c.openModel, structured: false });
    const model = new MetaSecretary(f.store, c, meta, open);
    f.store.secretary.model = model; await model.weeklyTick();
    assert.equal(url, `${basetenBaseUrl}/chat/completions`); assert.equal(metaCalls, 0);
    assert.equal(requestBody.model, 'muse-spark-open-1026');
    assert.ok(!('response_format' in requestBody)); assert.ok(!('reasoning_effort' in requestBody));
    const weekly = model.weekly(f.person.personId)!;
    assert.match(weekly.text, /很穩定/); assert.equal(weekly.model, 'muse-spark-open-1026');
    model.close();
  } finally { f.close(); }
});
test('開源模型用錯欄位名也接得住，亂寫才丟掉', async () => {
  const f = fixture();
  try {
    f.feed('08:00');
    for (const c of ['13:00', '13:05', '13:10']) f.feed(c, x => { x.screenInteractive = false; });
    f.feed('13:15', x => { x.screenInteractive = false; x.batteryPercent = 10; });
    const c = metaConfig({ PICOCARE_META_ENABLED: 'true', MODEL_API_KEY: 'test-secret-never-publish', BASENTEN_API_KEY: 'baseten-test-never-publish' });
    const meta = new MetaApi(c, async () => reply('unused'));
    const open = new MetaApi(c, async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: '{"reviewText":"媽媽這週有出門，也有看影片。"}' } }], usage: {} }),
      { baseUrl: basetenBaseUrl, key: 'x', model: c.openModel, structured: false });
    const model = new MetaSecretary(f.store, c, meta, open);
    f.store.secretary.model = model; await model.weeklyTick();
    assert.match(model.weekly(f.person.personId)!.text, /有出門/);
    model.close();
  } finally { f.close(); }
});
test('Meta 額度打滿時開源路徑照寫，沒 key 才停手', async () => {
  for (const withOpen of [true, false]) {
    const f = fixture(); let calls = 0;
    try {
      f.feed('08:00');
      for (const c of ['13:00', '13:05', '13:10']) f.feed(c, x => { x.screenInteractive = false; });
      f.feed('13:15', x => { x.screenInteractive = false; x.batteryPercent = 10; });
      const c = metaConfig({ PICOCARE_META_ENABLED: 'true', MODEL_API_KEY: 'test-secret-never-publish', PICOCARE_META_DAILY_LIMIT: '1', ...(withOpen ? { BASENTEN_API_KEY: 'baseten-test-never-publish' } : {}) });
      assert.equal(c.openKey, withOpen ? 'baseten-test-never-publish' : '');
      const meta = new MetaApi(c, async () => { calls++; return reply('unused'); });
      const open = withOpen ? new MetaApi(c, async () => { calls++; return reply('開源寫的回顧。'); }, { baseUrl: basetenBaseUrl, key: 'x', model: c.openModel, structured: false }) : null;
      const model = new MetaSecretary(f.store, c, meta, open as any);
      f.store.run("INSERT INTO meta_requests(person_id,at,model,status) VALUES(?,?,?,'accepted')", f.person.personId, Date.parse('2026-10-27T05:00:00Z'), 'muse-spark-1.3');
      f.store.secretary.model = model; await model.weeklyTick();
      assert.equal(calls, withOpen ? 1 : 0);
      model.close();
    } finally { f.close(); }
  }
});
test('Meta 寫出醫療字眼就整段丟掉，不存不送', async () => {
  const f = fixture();
  try {
    f.feed('08:00');
    for (const c of ['13:00', '13:05', '13:10']) f.feed(c, x => { x.screenInteractive = false; });
    f.feed('13:15', x => { x.screenInteractive = false; x.batteryPercent = 10; });
    const c = config(), model = new MetaSecretary(f.store, c, new MetaApi(c, async () => reply('媽媽可能失眠，建議就醫檢查。')));
    f.store.secretary.model = model; await model.weeklyTick();
    assert.equal(model.weekly(f.person.personId), null); assert.equal(model.status().status, 'fallback');
    model.close();
  } finally { f.close(); }
});
