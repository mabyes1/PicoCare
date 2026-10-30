import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { CareStore } from '../src/store.ts';
import { makeServer } from '../src/server.ts';
import { startOfDay } from '../src/domain.ts';
import { zhStampEn } from '../src/workflow.ts';
import type { ContextSample } from '../src/context-engine.ts';
import type { PhoneContext } from '../shared/protocol.ts';

const day = '2026-10-27';
const at = (clock: string) => Date.parse(`${day}T${clock}:00+08:00`);
const empty = (): PhoneContext => ({ batteryPercent: 80, charging: false, network: 'online', screenInteractive: true, ringer: 'normal', motion: 'unknown', location: null, notifications: [], sharing: 'summary' });
function fixture() {
  let now = at('08:00');
  const s = new CareStore(':memory:', () => now), { identity } = s.createWorkspace({ kind: 'personal', label: 'lang', caregiverName: '家人', timezone: 'Asia/Taipei' });
  const pair = s.createPairing(identity, { displayName: '媽媽' }), phone = s.enroll({ code: pair.code, requestId: randomUUID() });
  const feed = (clock: string, change?: (c: PhoneContext) => void) => {
    const t = at(clock), context = empty(); change?.(context);
    now = t; s.ingest(phone.deviceToken, { eventId: randomUUID(), kind: 'context', observedAt: now, context }); s.flow.tick();
  };
  const atNow = (clock: string) => { now = at(clock); return now; };
  const notes = (lang?: 'en' | 'zh') => s.secretary.notes.recent(phone.personId, 20, lang);
  return { s, identity, phone, feed, notes, atNow, close: () => s.close() };
}
test('語言預設中文，切換後中英文動態各自保留', () => {
  const f = fixture(); try {
    assert.equal(f.s.lang(), 'zh');
    f.feed('08:00');
    assert.equal(f.notes().find(n => n.kind === 'morning')!.title, '今天第一次看到你用手機');
    f.s.setLang('en');
    assert.equal(f.s.lang(), 'en');
    assert.equal(f.notes().length, 0);
    f.s.backfillLang('en');
    const morning = f.notes().find(n => n.kind === 'morning')!;
    assert.equal(morning.title, 'First time on the phone today'); assert.match(morning.body, /08:00/);
    assert.equal(f.notes('zh').find(n => n.kind === 'morning')!.title, '今天第一次看到你用手機');
    f.feed('08:01');
    assert.equal(f.notes().filter(n => n.kind === 'morning').length, 1);
  } finally { f.close(); }
});
test('提醒的固定文字會隨語言轉寫，數值原樣保留', () => {
  const f = fixture(); try {
    f.feed('08:00', c => { c.batteryPercent = 85; });
    f.s.ingest(f.phone.deviceToken, { eventId: randomUUID(), kind: 'help', observedAt: f.atNow('08:05') });
    const zh = f.s.flow.alerts(f.identity).find(a => a.kind === 'help')!;
    assert.equal(zh.title, '本人明確希望照顧者聯絡');
    assert.match(zh.evidence.join('\n'), /當時電量 85%/);
    f.s.setLang('en');
    const en = f.s.flow.alerts(f.identity).find(a => a.kind === 'help')!;
    assert.equal(en.title, 'The person explicitly asked the caregiver to make contact');
    assert.match(en.evidence.join('\n'), /Battery at the time 85%/);
    assert.match(en.evidence.join('\n'), /Last phone data received: /);
  } finally { f.close(); }
});
test('中文日期戳轉英文短格式，未知形狀原樣保留', () => {
  assert.equal(zhStampEn('2026/10/29 晚上9:25'), '10/29/26, 9:25 PM');
  assert.equal(zhStampEn('2026/10/27 下午6:53'), '10/27/26, 6:53 PM');
  assert.equal(zhStampEn('2026/10/29 上午8:05'), '10/29/26, 8:05 AM');
  assert.equal(zhStampEn('10/29/26, 9:25 PM'), '10/29/26, 9:25 PM');
});
test('startOfDay 對齊台北午夜', () => {
  assert.equal(startOfDay(Date.parse('2026-10-27T15:30:00+08:00'), 'Asia/Taipei'), Date.parse('2026-10-27T00:00:00+08:00'));
  assert.equal(startOfDay(Date.parse('2026-10-27T00:00:00+08:00'), 'Asia/Taipei'), Date.parse('2026-10-27T00:00:00+08:00'));
});
test('HTTP /api/lang 需登入，切換後狀態帶語言', async () => {
  const f = fixture(), server = makeServer(f.s);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string'); const base = `http://127.0.0.1:${address.port}`;
  const request = async (path: string, data?: unknown, headers: Record<string, string> = {}) => {
    const response = await fetch(base + path, { method: data === undefined ? 'GET' : 'POST', headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    return { status: response.status, body: await response.json() as any };
  };
  try {
    assert.equal((await request('/api/lang')).status, 401);
    assert.equal((await request('/api/lang', { lang: 'en' })).status, 401);
    const phone = { Authorization: `Bearer ${f.phone.deviceToken}` };
    assert.equal((await request('/api/lang', undefined, phone)).body.lang, 'zh');
    assert.equal((await request('/api/lang', { lang: 'xx' }, phone)).status, 400);
    assert.equal((await request('/api/lang', { lang: 'en' }, phone)).body.lang, 'en');
    assert.equal((await request('/api/device/status', undefined, phone)).body.lang, 'en');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); f.close(); }
});
