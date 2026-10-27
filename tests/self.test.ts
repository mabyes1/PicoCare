import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { CareStore } from '../src/store.ts';
import { makeServer } from '../src/server.ts';
const now = Date.parse('2026-10-27T08:00:00Z');
test('本人可先開始秘書，不需要建立照顧者工作階段；重試保持同一身份', () => {
  const s = new CareStore(':memory:', () => now);
  try {
    const request = { displayName: 'Ken', requestId: randomUUID() }, first = s.selfEnroll(request), retry = s.selfEnroll(request);
    assert.deepEqual(first, retry); assert.equal(first.caregiverConnected, false);
    assert.equal(s.get('SELECT count(*) n FROM people')!.n, 1); assert.equal(s.get('SELECT count(*) n FROM sessions')!.n, 0);
    assert.throws(() => s.selfEnroll({ ...request, displayName: '其他人' }), /內容不同/);
    assert.throws(() => s.selfEnroll({ displayName: 'Ken', requestId: 'predictable' }), /隨機 UUID/);
    const second = s.selfEnroll({ displayName: '另一位', requestId: randomUUID() }); assert.notEqual(first.personId, second.personId);
    assert.notEqual(s.device(first.deviceToken).workspace_id, s.device(second.deviceToken).workspace_id);
  } finally { s.close(); }
});
test('手機只看到自己的判讀、問題與原話，可設定自己的關心時間', () => {
  const s = new CareStore(':memory:', () => now);
  try {
    const a = s.selfEnroll({ displayName: 'Ken', requestId: randomUUID() }), b = s.selfEnroll({ displayName: '其他人', requestId: randomUUID() });
    s.ingest(a.deviceToken, { eventId: randomUUID(), kind: 'context', observedAt: now, context: { batteryPercent: 66, charging: false, network: 'online', screenInteractive: true, ringer: 'normal', motion: 'unknown', location: null, notifications: [], sharing: 'summary' } }); s.flow.tick();
    const status = s.deviceStatus(a.deviceToken), other = s.deviceStatus(b.deviceToken);
    assert.equal(status.personName, 'Ken'); assert.equal(status.caregiverConnected, false); assert(status.assessment.evidence.some(e => e.label.includes('66%')));
    assert.equal(other.observedAt, null); assert.equal(status.enrollmentMode, 'self');
    const plan = s.selfPlan(a.deviceToken, { enabled: true, contextualEnabled: true, timeOfDay: '17:00', graceMinutes: 1, responseMinutes: 5, deferMinutes: 5 });
    assert.equal(plan.timeOfDay, '17:00'); assert.equal(s.deviceStatus(b.deviceToken).plan.enabled, false);
    s.ingest(a.deviceToken, { eventId: randomUUID(), kind: 'help', observedAt: now });
    assert.equal(s.deviceStatus(a.deviceToken).helpOpen, true); assert.equal(s.deviceStatus(a.deviceToken).caregiverConnected, false);
  } finally { s.close(); }
});
test('HTTP 本人啟用入口及私有狀態需要正確裝置憑證', async () => {
  const s = new CareStore(':memory:', () => now), server = makeServer(s); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string'); const base = `http://127.0.0.1:${address.port}`;
  try {
    const response = await fetch(base + '/api/device/self-enroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: '本人', requestId: randomUUID() }) });
    assert.equal(response.status, 201); const phone = await response.json();
    assert.equal((await fetch(base + '/api/device/status')).status, 401);
    const status = await fetch(base + '/api/device/status', { headers: { Authorization: `Bearer ${phone.deviceToken}` } }).then(r => r.json());
    assert.equal(status.caregiverConnected, false); assert.equal(status.personName, '本人'); assert(status.secretary); assert.equal(status.meta.enabled, false);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); s.close(); }
});
