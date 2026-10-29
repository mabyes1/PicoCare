import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { ContextSample } from '../src/context-engine.ts';
import type { PhoneContext } from '../shared/protocol.ts';
import { CareStore } from '../src/store.ts';

const m = 60000, day = '2026-10-27';
const at = (clock: string) => Date.parse(`${day}T${clock}:00+08:00`);
const empty = (): PhoneContext => ({ batteryPercent: 80, charging: false, network: 'online', screenInteractive: true, ringer: 'normal', motion: 'unknown', location: null, notifications: [], sharing: 'summary' });
const sample = (clock: string, change?: (c: PhoneContext) => void): ContextSample => {
  const t = at(clock), context = empty(); change?.(context);
  return { id: randomUUID(), at: t, context };
};
const video = (clock: string): ContextSample => sample(clock, c => {
  c.sources = { notifications: 'available', location: 'disabled', usage: 'available', media: 'available' };
  c.usage = { appId: 'com.google.android.youtube', category: 'video', observedAt: at(clock), changedAt: at('19:00') };
  c.media = { appId: 'com.google.android.youtube', state: 'playing', observedAt: at(clock) };
});
function fixture() {
  let now = at('08:00');
  const s = new CareStore(':memory:', () => now), { identity } = s.createWorkspace({ kind: 'personal', label: '動態測試', caregiverName: '家人', timezone: 'Asia/Taipei' });
  const pair = s.createPairing(identity, { displayName: '媽媽' }), phone = s.enroll({ code: pair.code, requestId: randomUUID() });
  s.flow.setPlan(identity, phone.personId, { enabled: false, contextualEnabled: true, graceMinutes: 4, responseMinutes: 2, deferMinutes: 2, cooldownMinutes: 60 });
  const feed = (v: ContextSample) => { now = v.at; s.ingest(phone.deviceToken, { eventId: v.id, kind: 'context', observedAt: now, context: v.context }); s.flow.tick(); };
  const notes = () => s.secretary.view(phone.personId).notes;
  return { s, phone, feed, notes, close: () => s.close() };
}
test('早晨第一次互動、日間安靜、低電量都會變成有依據的動態', () => {
  const f = fixture(); try {
    f.feed(sample('08:00'));
    const morning = f.notes().find(n => n.kind === 'morning')!;
    assert.equal(morning.title, '今天第一次看到你用手機'); assert.match(morning.body, /08:00/);
    assert.equal(morning.evidence.length, 1); assert.equal(morning.source, 'local_evidence');
    f.feed(sample('08:01')); f.feed(sample('08:02'));
    assert.equal(f.notes().filter(n => n.kind === 'morning').length, 1);
    for (const c of ['13:00', '13:05', '13:10']) f.feed(sample(c, x => { x.screenInteractive = false; }));
    const quiet = f.notes().find(n => n.kind === 'quiet')!;
    assert.equal(quiet.title, '今天手機很安靜'); assert.match(quiet.body, /08:0/);
    f.feed(sample('13:15', x => { x.screenInteractive = false; x.batteryPercent = 10; }));
    const battery = f.notes().find(n => n.kind === 'battery')!;
    assert.match(battery.body, /10%/);
  } finally { f.close(); }
});
test('深夜亮屏與晚間長時間看片各只記一則，數字來自真實觀測', () => {
  const f = fixture(); try {
    f.feed(sample('19:00')); f.feed(sample('19:02')); f.feed(sample('19:04')); f.feed(sample('19:06')); f.feed(sample('19:08')); f.feed(video('19:10'));
    for (const c of ['19:11', '19:13', '19:15', '19:17', '19:19', '19:21']) f.feed(video(c));
    const v = f.notes().find(n => n.kind === 'evening_video')!;
    assert.equal(v.title, '今晚看了好一會兒影片'); assert.match(v.body, /19:1\d.*19:2\d/); assert.match(v.body, /分鐘/);
    f.feed(sample('23:30')); f.feed(sample('23:35'));
    assert.equal(f.notes().filter(n => n.kind === 'late_screen').length, 1);
    assert.match(f.notes().find(n => n.kind === 'late_screen')!.body, /23:3/);
  } finally { f.close(); }
});
test('當天移動超過四百公尺記一則出門動態', () => {
  const f = fixture(); try {
    f.feed(sample('10:00', c => { c.sources = { notifications: 'available', location: 'available' }; c.sharing = 'detailed';
      c.location = { latitude: 25, longitude: 121, accuracy: 10, observedAt: at('10:00') }; }));
    f.feed(sample('10:05', c => { c.sources = { notifications: 'available', location: 'available' }; c.sharing = 'detailed';
      c.location = { latitude: 25.005, longitude: 121, accuracy: 10, observedAt: at('10:05') }; }));
    const o = f.notes().find(n => n.kind === 'outing')!;
    assert.equal(o.title, '今天有出門走走'); assert.match(o.body, /公尺/);
    assert.ok(Number(o.body.replace(/[^0-9]/g, '')) >= 400);
  } finally { f.close(); }
});
test('外出提問會在動態牆留一則，證據沿用判讀依據', () => {
  const f = fixture(); try {
    const square = [[25, 121], [25.002, 121], [25.002, 121.002], [25, 121.002]];
    for (let i = 0; i < 9; i++) {
      const t = at('10:00') + i * m, [latitude, longitude] = square[i % 4];
      f.feed({ id: randomUUID(), at: t, context: { ...empty(), batteryPercent: 25 - 2 * i, sharing: 'detailed',
        sources: { notifications: 'available', location: 'available' }, notifications: [{ category: 'navigation', observedAt: t, postedAt: t }],
        location: { latitude, longitude, accuracy: 10, observedAt: t } } });
    }
    const asked = f.notes().find(n => n.kind === 'asked_outing')!;
    assert.equal(asked.title, '我問了你出門的事'); assert.ok(asked.evidence.length >= 1);
    assert.ok(f.notes().some(n => n.kind === 'outing'));
  } finally { f.close(); }
});
test('同一天動態最多六則，同種一天只記一次', () => {
  const f = fixture(); try {
    f.feed(sample('08:00'));
    for (const c of ['13:00', '13:05', '13:10']) f.feed(sample(c, x => { x.screenInteractive = false; }));
    f.feed(sample('13:15', x => { x.screenInteractive = false; x.batteryPercent = 10; }));
    f.feed(sample('19:00')); f.feed(sample('23:30'));
    for (const c of ['19:31', '19:33', '19:35', '19:37', '19:39', '19:41', '19:43']) f.feed(video(c));
    const d = f.s.secretary.decision(f.phone.personId);
    f.s.secretary.notes.videoWait(f.phone.personId, d); f.s.secretary.notes.askedVideo(f.phone.personId, d);
    assert.ok(f.notes().length <= 6);
    const kinds = f.notes().map(n => n.kind);
    assert.equal(new Set(kinds).size, kinds.length);
  } finally { f.close(); }
});
