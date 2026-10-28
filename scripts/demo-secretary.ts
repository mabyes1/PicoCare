import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { CareStore } from '../src/store.ts';
import { makeServer } from '../src/server.ts';
import type { PhoneContext } from '../shared/protocol.ts';

// Isolated replay: all phone inputs are synthetic, delivered through the normal event parser and interpreter.
const minute = 60000, base = Date.parse('2026-10-27T09:57:00+08:00'); let now = base;
const store = new CareStore(':memory:', () => now);
const { identity, session } = store.createWorkspace({ kind: 'personal', label: '秘書情境重播（全部合成資料）', caregiverName: 'Demo 家人', timezone: 'Asia/Taipei' });
const pair = store.createPairing(identity, { displayName: '媽媽（合成）' }), phone = store.enroll({ code: pair.code, requestId: randomUUID() });
store.flow.setPlan(identity, phone.personId, { enabled: true, contextualEnabled: true, graceMinutes: 4, responseMinutes: 2, deferMinutes: 2, cooldownMinutes: 60 });
const app = makeServer(store), handler = app.listeners('request')[0] as Parameters<typeof createServer>[1];
const server = createServer((req, res) => {
  if (req.url === '/demo' && req.method === 'GET') {
    res.writeHead(302, { 'Set-Cookie': `picocare_session=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`, Location: '/' }); res.end(); return;
  }
  if (typeof handler === 'function') handler(req, res);
});
server.listen(4318, '127.0.0.1', () => console.log('PicoCare synthetic secretary replay: http://localhost:4318/demo\nCommands: video → pause → forgot → outing → contact (or busy / else / timeout / ok)'));
function context(): PhoneContext { return { batteryPercent: 80, charging: false, network: 'online', screenInteractive: true, ringer: 'normal', motion: 'unknown', location: null, notifications: [], sharing: 'summary' }; }
function feed(at: number, c: PhoneContext) { now = at; store.ingest(phone.deviceToken, { eventId: randomUUID(), kind: 'context', observedAt: now, context: c }); store.flow.tick(); }
function video(at: number, paused = false) { feed(at, { ...context(), sources: { notifications: 'available', location: 'disabled', usage: 'available', media: 'available' },
  usage: { appId: 'com.google.android.youtube', category: 'video', observedAt: at, changedAt: base }, media: { appId: 'com.google.android.youtube', state: paused ? 'paused' : 'playing', observedAt: at } }); }
createInterface({ input: process.stdin }).on('line', line => {
  try {
    const command = line.trim();
    if (command === 'video') for (let i = 0; i <= 5; i++) video(base + i * minute);
    else if (command === 'pause') video(base + 6 * minute, true);
    else if (command === 'outing') {
      const square = [[25, 121], [25.002, 121], [25.002, 121.002], [25, 121.002]], start = base + 60 * minute;
      for (let i = 0; i < 9; i++) { const at = start + i * minute, [latitude, longitude] = square[i % 4]; feed(at, { ...context(), batteryPercent: 25 - 2 * i, sharing: 'detailed', sources: { notifications: 'available', location: 'available' },
        notifications: [{ category: 'navigation', observedAt: at, postedAt: start }], location: { latitude, longitude, accuracy: 10, observedAt: at } }); }
    } else if (command === 'timeout') {
      now = Math.max(now, store.secretary.view(phone.personId).outing?.deadline || store.flow.runView(phone.personId)?.deadline || now) + 1; store.flow.tick();
    } else {
      const q = store.deviceStatus(phone.deviceToken).question;
      if (!q) throw new Error('目前沒有開放的問題');
      const optionId = ({ forgot: 'video_forgot', contact: 'outing_contact', ok: 'outing_ok', busy: 'busy', else: 'else' } as Record<string, string>)[command];
      if (!optionId) throw new Error('未知指令');
      store.ingest(phone.deviceToken, { eventId: randomUUID(), kind: 'question_answer', observedAt: now, questionId: q.id, optionId, ...(optionId === 'else' ? { elseText: '合成回答：我在等朋友，不是找路' } : {}) });
    }
    console.log(JSON.stringify({ time: new Date(now).toISOString(), decision: store.secretary.view(phone.personId).decision.title, daily: store.flow.runView(phone.personId)?.state,
      outing: store.secretary.view(phone.personId).outing?.state, question: store.deviceStatus(phone.deviceToken).question?.prompt, alerts: store.flow.alerts(identity).filter(a => !a.resolvedAt).length }));
  } catch (e) { console.error(e instanceof Error ? e.message : 'Replay failed'); }
});
const stop = () => server.close(() => { store.close(); process.exit(0); });
process.on('SIGINT', stop); process.on('SIGTERM', stop);
