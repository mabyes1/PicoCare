import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { CareStore } from '../src/store.ts';
import { makeServer } from '../src/server.ts';
import { LocalContextProvider } from '../src/assessment.ts';
import type { Context } from '../src/domain.ts';

const now = Date.parse('2026-10-27T11:00:00Z');
const context = (changes: Partial<Context> = {}): Context => ({ batteryPercent: 80, charging: false, network: 'online',
  screenInteractive: false, ringer: 'normal', motion: 'unknown', location: null, notifications: [], sharing: 'summary', ...changes });
const event = (kind: string, changes: Record<string, unknown> = {}) => ({ eventId: randomUUID(), kind, observedAt: now, ...changes });
const workspace = (store: CareStore, kind: 'personal' | 'institution' = 'personal') => store.createWorkspace({ label: '測試照顧空間', caregiverName: '照顧者', kind });
function device(store: CareStore) {
  const { identity } = workspace(store), pairing = store.createPairing(identity, { displayName: '媽媽' });
  const paired = store.enroll({ code: pairing.code, requestId: randomUUID() }); return { identity, paired };
}

test('HTTP 完成配對、情境、提醒回條、報安與獨立求助', async () => {
  const store = new CareStore(':memory:', () => now), server = makeServer(store);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string'); const base = `http://127.0.0.1:${address.port}`;
  async function request(path: string, data?: unknown, headers: Record<string, string> = {}) {
    const response = await fetch(base + path, { method: data === undefined ? 'GET' : 'POST', headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    return { status: response.status, headers: response.headers, body: await response.json() as any };
  }
  try {
    assert.equal((await request('/api/people')).status, 401);
    const created = await request('/api/workspaces', { label: '我的家庭', caregiverName: '小安', kind: 'personal' }); assert.equal(created.status, 201);
    const cookie = created.headers.get('set-cookie')!.split(';')[0]; const auth = { Cookie: cookie };
    const pairing = await request('/api/pairings', { displayName: '媽媽' }, auth); assert.equal(pairing.status, 201);
    const paired = await request('/api/device/enroll', { code: pairing.body.code, requestId: randomUUID() }); assert.equal(paired.status, 201);
    const phone = { Authorization: `Bearer ${paired.body.deviceToken}` };
    const snapshot = await request('/api/device/events', event('context', { context: context() }), phone); assert.equal(snapshot.status, 202);
    const personId = paired.body.personId;
    const reminder = await request(`/api/people/${personId}/reminders`, {}, auth); assert.equal(reminder.status, 201);
    const status = await request('/api/device/status', undefined, phone); assert.equal(status.body.reminders[0].id, reminder.body.id);
    assert.equal((await request('/api/device/events', event('reminder_result', { reminderId: reminder.body.id, result: 'executed' }), phone)).status, 202);
    await request('/api/device/events', event('help'), phone);
    await request('/api/device/events', event('checkin'), phone);
    const detail = await request(`/api/people/${personId}`, undefined, auth);
    assert.equal(detail.body.person.checkin, 'reported'); assert.equal(detail.body.person.helpOpen, true);
    assert.equal(detail.body.reminders[0].result, 'executed');
    assert.equal(detail.body.person.assessment.source, 'rules');
    assert.equal((await request('/health')).body.meta.enabled, false);
    const person = detail.body.person;
    assert.equal((await request(`/api/people/${personId}/contacts`, { outcome: 'help_resolved', helpEventId: person.helpEventId, revision: person.revision }, auth)).status, 201);
    assert.equal((await request('/api/device/status', undefined, phone)).body.helpOpen, false);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});

test('同一事件重送使用同一回執，內容衝突拒收', () => {
  const store = new CareStore(':memory:', () => now);
  try {
    const { paired } = device(store), payload = event('help');
    const first = store.ingest(paired.deviceToken, payload), second = store.ingest(paired.deviceToken, { ...payload });
    assert.equal(first.receiptId, second.receiptId); assert.equal(second.duplicate, true);
    assert.throws(() => store.ingest(paired.deviceToken, { ...payload, kind: 'checkin' }), /內容不同/);
    assert.equal(store.get('SELECT count(*) AS n FROM events')!.n, 1);
  } finally { store.close(); }
});

test('重新開啟 SQLite 仍保留配對與回執', () => {
  const directory = mkdtempSync(join(tmpdir(), 'picocare-')), path = join(directory, 'care.sqlite'); let store = new CareStore(path, () => now);
  try {
    const { paired } = device(store), payload = event('checkin'), receipt = store.ingest(paired.deviceToken, payload);
    store.close(); store = new CareStore(path, () => now);
    assert.equal(store.ingest(paired.deviceToken, payload).receiptId, receipt.receiptId);
    assert.equal(store.deviceStatus(paired.deviceToken).checkin, 'reported');
  } finally { store.close(); rmSync(directory, { recursive: true }); }
});

test('機構與個人空間隔離，手機不可回傳別人的提醒', () => {
  const store = new CareStore(':memory:', () => now);
  try {
    const first = device(store), second = device(store);
    assert.equal(store.list(first.identity).people.length, 1);
    assert.throws(() => store.detail(first.identity, second.paired.personId), /找不到/);
    const reminder = store.requestCheckin(second.identity, second.paired.personId);
    assert.throws(() => store.ingest(first.paired.deviceToken, event('reminder_result', { reminderId: reminder.id, result: 'executed' })), /不屬於/);
    const institution = workspace(store, 'institution').identity; assert.equal(store.list(institution).people.length, 0);
  } finally { store.close(); }
});

test('配對重試保留同一裝置，新請求不可重用已消耗的碼', () => {
  let clock = now; const store = new CareStore(':memory:', () => clock);
  try {
    const { identity } = workspace(store), pairing = store.createPairing(identity, { displayName: '媽媽' }), payload = { code: pairing.code, requestId: randomUUID() };
    const first = store.enroll(payload), retry = store.enroll(payload); assert.deepEqual(first, retry);
    assert.throws(() => store.enroll({ ...payload, requestId: randomUUID() }), /已被使用/);
    clock += 600001; assert.throws(() => store.enroll(payload), /已過期/);
  } finally { store.close(); }
});

test('晚到的舊情境不覆蓋新觀測，收到時間不會洗新觀測', () => {
  const store = new CareStore(':memory:', () => now);
  try {
    const { identity, paired } = device(store);
    store.ingest(paired.deviceToken, event('context', { observedAt: now - 600000, context: context({ batteryPercent: 20 }) }));
    let p = store.detail(identity, paired.personId).person;
    assert.equal(p.connection, 'recent'); assert.equal(p.assessment.state, 'stale');
    store.ingest(paired.deviceToken, event('context', { context: context({ batteryPercent: 70 }) }));
    store.ingest(paired.deviceToken, event('context', { observedAt: now - 10000, context: context({ batteryPercent: 30 }) }));
    p = store.detail(identity, paired.personId).person; assert(p.facts); assert.equal(p.facts.batteryPercent, 70); assert.equal(p.observedAt, now);
  } finally { store.close(); }
});

test('新求助到達後，舊頁面不能完成處理；晚到報安不解除求助', () => {
  const store = new CareStore(':memory:', () => now);
  try {
    const { identity, paired } = device(store);
    store.ingest(paired.deviceToken, event('help')); const old = store.detail(identity, paired.personId).person;
    store.ingest(paired.deviceToken, event('help')); store.ingest(paired.deviceToken, event('checkin'));
    assert.throws(() => store.contact(identity, paired.personId, { outcome: 'help_resolved', revision: old.revision, helpEventId: old.helpEventId }), /已有更新/);
    assert.equal(store.detail(identity, paired.personId).person.helpOpen, true);
    store.ingest(paired.deviceToken, event('checkin', { observedAt: now - 86400000 }));
    assert.equal(store.detail(identity, paired.personId).person.lastCheckin, now);
  } finally { store.close(); }
});

test('摘要模式拒絕原文與精確位置，詳細模式接受本人選擇的來源', () => {
  const store = new CareStore(':memory:', () => now);
  try {
    const { paired } = device(store);
    const notifications = [{ category: 'other' as const, text: '合成測試通知', observedAt: now }];
    assert.throws(() => store.ingest(paired.deviceToken, event('context', { context: context({ notifications }) })), /摘要模式/);
    store.ingest(paired.deviceToken, event('context', { context: context({ notifications, sharing: 'detailed', location: { latitude: 25, longitude: 121, accuracy: 10, observedAt: now } }) }));
    assert.throws(() => store.ingest(paired.deviceToken, event('context', { context: { ...context(), hiddenField: 'unexpected' } })), /不支援/);
    assert.throws(() => store.ingest(paired.deviceToken, event('context', { observedAt: now + 120001, context: context() })), /時間/);
  } finally { store.close(); }
});

test('提醒逾期不再派送，重複點擊只排入一筆，報安取消待執行提醒', () => {
  let clock = now; const store = new CareStore(':memory:', () => clock);
  try {
    const { paired, identity } = device(store);
    const first = store.requestCheckin(identity, paired.personId), retry = store.requestCheckin(identity, paired.personId);
    assert.equal(first.id, retry.id); assert.equal(retry.duplicate, true);
    clock += 1800001; assert.equal(store.deviceStatus(paired.deviceToken).reminders.length, 0);
    store.requestCheckin(identity, paired.personId);
    store.ingest(paired.deviceToken, event('checkin', { observedAt: clock }));
    assert.equal(store.deviceStatus(paired.deviceToken).reminders.length, 0);
    assert.equal(store.detail(identity, paired.personId).reminders[0].result, 'cancelled');
  } finally { store.close(); }
});

test('情境整理對過期來源保留未知；沒有冒稱 Meta 推論', () => {
  const provider = new LocalContextProvider();
  const moving = context({ motion: 'moving', motionEvidence: { observedAt: now, accuracy: 10, speed: 2, speedAccuracy: 0.2 }, notifications: [{ category: 'navigation', observedAt: now }] });
  assert.equal(provider.assess(moving, now, now).title, '可能正在外出途中');
  assert.equal(provider.assess(moving, now - 120001, now).state, 'stale');
  assert.notEqual(provider.assess(context({ motion: 'moving', notifications: [{ category: 'navigation', observedAt: now - 130000 }] }), now, now).title, '可能正在外出途中');
  assert.equal(provider.assess(null, null, now).source, 'rules');
  assert.notEqual(provider.assess(context({ batteryPercent: 5, charging: null }), now, now).nextAction, '先提醒充電，避免手機沒電後失去聯絡');
});

test('手機時鐘慢一分鐘仍完成當日報安並停止提醒，前一天回覆不停止今日提醒', () => {
  const store = new CareStore(':memory:', () => now);
  try {
    const { identity, paired } = device(store);
    store.requestCheckin(identity, paired.personId);
    store.ingest(paired.deviceToken, event('checkin', { observedAt: now - 86400000 }));
    assert.equal(store.deviceStatus(paired.deviceToken).checkin, 'awaiting');
    assert.equal(store.deviceStatus(paired.deviceToken).reminders.length, 1);
    store.ingest(paired.deviceToken, event('checkin', { observedAt: now - 60000 }));
    assert.equal(store.deviceStatus(paired.deviceToken).checkin, 'reported');
    assert.equal(store.deviceStatus(paired.deviceToken).reminders.length, 0);
  } finally { store.close(); }
});

test('示範與真手機分開，重複加入示範不洗新資料', () => {
  let clock = now; const store = new CareStore(':memory:', () => clock);
  try {
    const { identity } = workspace(store); store.seedDemo(identity); const first = store.list(identity).people;
    assert.equal(first.length, 3); assert(first.every(p => p.demo));
    clock += 600000; assert.equal(store.seedDemo(identity).created, false);
    const second = store.list(identity).people; assert.equal(first[0].observedAt, second[0].observedAt);
    assert.throws(() => store.requestCheckin(identity, first[0].id), /示範/);
  } finally { store.close(); }
});

test('HTTP 拒絕跨來源寫入、無效 Host 及路徑穿越', async () => {
  const store = new CareStore(':memory:', () => now), server = makeServer(store); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string'); const base = `http://127.0.0.1:${address.port}`;
  try {
    const response = await fetch(base + '/api/workspaces', { method: 'POST', headers: { Origin: 'https://outside.example', 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(response.status, 403);
    const invalidHost = await new Promise<number | undefined>((resolve, reject) => {
      const req = httpRequest(base + '/health', { headers: { Host: 'outside.example' } }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
      req.on('error', reject); req.end();
    });
    assert.equal(invalidHost, 403);
    assert.equal((await fetch(base + '/src/store.ts')).status, 404);
    assert.equal((await fetch(base + '/api/device/status')).status, 401);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});
