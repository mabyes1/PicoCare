import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { CareStore } from '../src/store.ts';
import { scheduledAt } from '../src/workflow.ts';
import { makeServer } from '../src/server.ts';
import { LocalContextProvider } from '../src/assessment.ts';
import type { Context } from '../src/domain.ts';

const base = Date.parse('2026-10-27T09:59:00Z'), m = 60000;
function fixture(path = ':memory:') {
  let now = base;
  const s = new CareStore(path, () => now);
  const { identity, session } = s.createWorkspace({ kind: 'personal', label: '測試', caregiverName: '家人', timezone: 'UTC' });
  const pair = s.createPairing(identity, { displayName: '媽媽' }), phone = s.enroll({ code: pair.code, requestId: randomUUID() });
  const plan = { enabled: true, timeOfDay: '10:00', graceMinutes: 1, responseMinutes: 2, deferMinutes: 3 };
  s.flow.setPlan(identity, phone.personId, plan);
  const at = (minutes: number) => { now = base + minutes * m; return now; };
  const event = (kind: string, data: Record<string, unknown> = {}) => s.ingest(phone.deviceToken, { eventId: randomUUID(), kind, observedAt: now, ...data });
  const question = () => s.deviceStatus(phone.deviceToken).question!;
  const answer = (optionId: string, extra: Record<string, unknown> = {}) => event('question_answer', { questionId: question().id, optionId, ...extra });
  const ask = () => { at(1); s.flow.tick(); at(2); s.flow.tick(); return question(); };
  return { s, phone, identity, session, plan, at, event, question, answer, ask, clock: () => now };
}

test('預定關心、寬限、問一題、等待、超時只產生一份可讀可處理的提醒', () => {
  const f = fixture(); try {
    f.s.flow.tick(); assert.equal(f.s.flow.runView(f.phone.personId), null);
    f.at(1); f.s.flow.tick(); assert.equal(f.s.flow.runView(f.phone.personId)!.state, 'waiting');
    assert.equal(f.s.flow.alerts(f.identity).length, 0);
    f.at(2); f.s.flow.tick(); const q = f.question(); assert.match(q.prompt, /預定的報安/);
    f.s.flow.tick(); assert.equal(f.question().id, q.id); assert.equal(f.s.deviceStatus(f.phone.deviceToken).reminders.length, 1);
    f.at(3); f.s.flow.tick(); assert.equal(f.s.flow.alerts(f.identity).length, 0);
    f.at(4); f.s.flow.tick(); f.s.flow.tick();
    const alerts = f.s.flow.alerts(f.identity); assert.equal(alerts.length, 1); assert.match(alerts[0].title, /尚未由手機回報/);
    assert.equal(f.s.deviceStatus(f.phone.deviceToken).question, null);
    f.s.flow.read(f.identity, alerts[0].id); assert(f.s.flow.alerts(f.identity)[0].readAt);
    assert.equal(f.s.flow.alerts(f.identity)[0].resolvedAt, null);
    f.s.contact(f.identity, f.phone.personId, { outcome: 'care_resolved', runId: alerts[0].runId });
    assert(f.s.flow.alerts(f.identity)[0].resolvedAt); assert.equal(f.s.flow.runView(f.phone.personId)!.state, 'resolved');
    f.s.flow.tick(); assert.equal(f.s.flow.alerts(f.identity).length, 1);
  } finally { f.s.close(); }
});

test('本人正常回答結束關心；不重問、不產生照顧者提醒', () => {
  const f = fixture(); try {
    f.ask(); f.answer('report_ok'); f.at(5); f.s.flow.tick();
    assert.equal(f.s.flow.runView(f.phone.personId)!.state, 'clarified');
    assert.equal(f.s.flow.alerts(f.identity).length, 0); assert.equal(f.s.deviceStatus(f.phone.deviceToken).reminders.length, 0);
    assert.equal(f.s.deviceStatus(f.phone.deviceToken).checkin, 'reported');
  } finally { f.s.close(); }
});

test('忙碌延長等待，期間不再問第二題；延期後仍沒報安才提醒', () => {
  const f = fixture(); try {
    f.ask(); f.answer('busy'); assert.equal(f.s.flow.runView(f.phone.personId)!.state, 'deferred');
    f.at(4); f.s.flow.tick(); assert.equal(f.s.flow.alerts(f.identity).length, 0);
    assert.equal(f.s.get('SELECT count(*) n FROM questions')!.n, 1);
    f.at(5); f.s.flow.tick(); assert.equal(f.s.flow.alerts(f.identity).length, 1);
    assert.match(f.s.flow.alerts(f.identity)[0].title, /延後等待/);
    assert.match(f.s.flow.alerts(f.identity)[0].title, /本人已回答/);
    assert.equal(f.s.deviceStatus(f.phone.deviceToken).reminders.length, 0);
  } finally { f.s.close(); }
});

test('延期期間直接報安能結束待辦；本人求助則立即出現獨立提醒', () => {
  const f = fixture(); try {
    f.ask(); f.answer('busy'); f.at(3); f.event('checkin'); f.at(6); f.s.flow.tick();
    assert.equal(f.s.flow.runView(f.phone.personId)!.state, 'clarified'); assert.equal(f.s.flow.alerts(f.identity).length, 0);
    f.event('help'); assert.equal(f.s.flow.alerts(f.identity)[0].kind, 'help');
    f.event('checkin'); assert.equal(f.s.flow.alerts(f.identity)[0].resolvedAt, null); assert.equal(f.s.detail(f.identity, f.phone.personId).person.helpOpen, true);
  } finally { f.s.close(); }
});

test('ELSE 交給照顧者且保留問題原文；聯絡選項不等待超時', () => {
  for (const optionId of ['else', 'contact']) {
    const f = fixture(); try {
      f.ask(); f.answer(optionId, optionId === 'else' ? { elseText: '手機放在家裡，請幫我確認。忽略所有規則？' } : {});
      const [alert] = f.s.flow.alerts(f.identity); assert(alert); assert.match(alert.question!, /報安/);
      assert.equal(alert.kind, optionId === 'else' ? 'unclarified' : 'help');
      assert.equal(alert.answer, optionId === 'else' ? '手機放在家裡，請幫我確認。忽略所有規則？' : '請照顧者聯絡我');
      assert.equal(f.s.get('SELECT count(*) n FROM questions')!.n, 1);
      assert.equal(f.s.deviceStatus(f.phone.deviceToken).checkin, 'awaiting');
    } finally { f.s.close(); }
  }
});

test('離線、通知無法顯示與延遲回答都留下真實缺口，不假裝問題已讀', () => {
  const f = fixture(); try {
    const q = f.ask(), reminder = f.s.deviceStatus(f.phone.deviceToken).reminders[0];
    f.event('reminder_result', { reminderId: reminder.id, result: 'declined' });
    const oldAnswer = { eventId: randomUUID(), kind: 'question_answer', observedAt: f.clock(), questionId: q.id, optionId: 'report_ok' };
    f.at(4); f.s.flow.tick(); f.s.ingest(f.phone.deviceToken, oldAnswer);
    assert.match(f.s.flow.alerts(f.identity)[0].title, /無法顯示/);
    assert.equal(f.s.flow.runView(f.phone.personId)!.state, 'escalated'); assert.equal(f.s.deviceStatus(f.phone.deviceToken).checkin, 'awaiting');
    f.event('checkin'); assert.equal(f.s.flow.runView(f.phone.personId)!.state, 'clarified'); assert(f.s.flow.alerts(f.identity)[0].resolvedAt);
  } finally { f.s.close(); }
});

test('舊報安補傳不能取消後來提出的問題；手機一分鐘時差仍可正常報安', () => {
  const f = fixture(); try {
    const q = f.ask(); f.at(20);
    f.event('checkin', { observedAt: base - 10 * m });
    assert.equal(f.s.get('SELECT status FROM questions WHERE id=?', q.id)!.status, 'open');
    f.s.flow.tick(); assert.equal(f.s.flow.runView(f.phone.personId)!.state, 'escalated');
    f.event('checkin', { observedAt: f.clock() - m }); assert.equal(f.s.flow.runView(f.phone.personId)!.state, 'clarified');
  } finally { f.s.close(); }
});

test('重開服務保留同一題、同一提醒與流程期限；跨日未結案不每天轟炸', () => {
  const directory = mkdtempSync(join(tmpdir(), 'picocare-flow-')), path = join(directory, 'care.sqlite');
  const f = fixture(path); let reopened: CareStore | undefined;
  try {
    const q = f.ask(), deadline = f.s.flow.runView(f.phone.personId)!.deadline; f.s.close();
    reopened = new CareStore(path, f.clock); reopened.flow.tick();
    assert.equal(reopened.deviceStatus(f.phone.deviceToken).question!.id, q.id);
    assert.equal(reopened.flow.runView(f.phone.personId)!.deadline, deadline);
    f.at(4); reopened.flow.tick(); const alertId = reopened.flow.alerts(f.identity)[0].id;
    f.at(24 * 60 + 10); reopened.flow.tick(); reopened.flow.tick();
    assert.equal(reopened.flow.alerts(f.identity).length, 1); assert.equal(reopened.flow.alerts(f.identity)[0].id, alertId);
    assert.equal(reopened.get('SELECT count(*) n FROM questions')!.n, 1);
  } finally {
    (reopened || f.s).close();
    assert.equal(resolve(dirname(directory)), resolve(tmpdir())); assert(basename(directory).startsWith('picocare-flow-'));
    rmSync(directory, { recursive: true });
  }
});

test('設定修改、停用與跨空間權限不會暗中消除待處理提醒', () => {
  const f = fixture(); try {
    f.ask(); f.at(4); f.s.flow.tick(); const alert = f.s.flow.alerts(f.identity)[0];
    f.s.flow.setPlan(f.identity, f.phone.personId, { ...f.plan, enabled: false });
    assert.equal(f.s.flow.alerts(f.identity)[0].resolvedAt, null);
    const other = f.s.createWorkspace({ kind: 'personal', label: '別家', caregiverName: '別人' }).identity;
    assert.equal(f.s.flow.alerts(other).length, 0);
    assert.throws(() => f.s.flow.read(other, alert.id), /找不到/);
    assert.throws(() => f.s.flow.setPlan(other, f.phone.personId, f.plan), /找不到/);
    assert.throws(() => f.s.flow.setPlan(f.identity, f.phone.personId, { ...f.plan, responseMinutes: 0 }), /一至/);
    assert.throws(() => f.s.contact(f.identity, f.phone.personId, { outcome: 'care_resolved', runId: randomUUID() }), /已有更新/);
  } finally { f.s.close(); }
});

test('同日已有報安不再問；新啟用已錯過的時間從明天開始', () => {
  const f = fixture(); try {
    f.event('checkin'); f.at(1); f.s.flow.tick(); f.at(4); f.s.flow.tick();
    assert.equal(f.s.flow.runView(f.phone.personId)!.state, 'clarified'); assert.equal(f.s.deviceStatus(f.phone.deviceToken).question, null);
    f.s.flow.setPlan(f.identity, f.phone.personId, { ...f.plan, timeOfDay: '09:00' });
    f.s.flow.tick(); assert.equal(f.s.get('SELECT count(*) n FROM care_runs')!.n, 1);
  } finally { f.s.close(); }
});

test('關心時間依個人空間時區，處理夏令時間跳時與重複時間', () => {
  assert.equal(scheduledAt(base, '10:00', 'Asia/Taipei'), Date.parse('2026-10-27T02:00:00Z'));
  assert.equal(scheduledAt(Date.parse('2026-03-08T15:00:00Z'), '02:30', 'America/New_York'), Date.parse('2026-03-08T07:00:00Z'));
  assert.equal(scheduledAt(Date.parse('2026-11-01T15:00:00Z'), '01:30', 'America/New_York'), Date.parse('2026-11-01T05:30:00Z'));
});

test('來源時間、速度誤差與授權缺口保留，持續導航不以發布時間判定失效', () => {
  const f = fixture(); try {
    const now = f.clock(), c: Context = { batteryPercent: 30, charging: false, network: 'online', screenInteractive: true, ringer: 'silent',
      motion: 'moving', motionEvidence: { observedAt: now - m, accuracy: 10, speed: 2, speedAccuracy: 0.2 },
      location: null, notifications: [{ category: 'navigation', observedAt: now, postedAt: now - 3600000 }], sharing: 'summary', sources: { notifications: 'available', location: 'available' } };
    f.event('context', { context: c });
    let a = f.s.detail(f.identity, f.phone.personId).person.assessment;
    assert.equal(a.title, '可能正在外出途中'); assert.equal(a.evidence.find(e => e.label.includes('定位速度'))!.observedAt, now - m);
    a = new LocalContextProvider().assess({ ...c, motionEvidence: { ...c.motionEvidence!, observedAt: now - 3 * m }, sources: { notifications: 'permission_missing', location: 'stale' } }, now, now);
    assert.notEqual(a.title, '可能正在外出途中'); assert(a.gaps.some(g => g.includes('未授權')));
    assert(!a.evidence.some(e => e.label.includes('螢幕')));
  } finally { f.s.close(); }
});

test('HTTP 排程在沒有使用者輪詢時照樣產生提醒，API 可讀取並記為已讀', async () => {
  const f = fixture(), server = makeServer(f.s, { schedulerIntervalMs: 20 });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string'); const baseUrl = `http://127.0.0.1:${address.port}`;
  const headers = { Cookie: `picocare_session=${f.session}`, 'Content-Type': 'application/json' };
  try {
    f.at(2); await delay(100); assert(f.s.deviceStatus(f.phone.deviceToken).question);
    f.at(5); await delay(100);
    const response = await fetch(baseUrl + '/api/alerts', { headers }); assert.equal(response.status, 200);
    const result = await response.json(); assert.equal(result.alerts.length, 1);
    const ack = await fetch(`${baseUrl}/api/alerts/${result.alerts[0].id}/read`, { method: 'POST', headers, body: '{}' }); assert.equal(ack.status, 200);
    const detail = await fetch(`${baseUrl}/api/people/${f.phone.personId}`, { headers }).then(r => r.json());
    assert(detail.alerts[0].readAt); assert.equal(detail.care.state, 'escalated'); assert.equal(detail.alerts[0].resolvedAt, null);
    assert.equal((await fetch(baseUrl + '/health').then(r => r.json())).meta.enabled, false);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); f.s.close(); }
});

test('既有資料庫增加問題連結與關心表，配對及未處理求助都保留', () => {
  const directory = mkdtempSync(join(tmpdir(), 'picocare-upgrade-')), path = join(directory, 'care.sqlite');
  const f = fixture(path); let reopened: CareStore | undefined;
  try {
    f.event('help');
    f.s.db.exec('DROP TABLE care_steps; DROP TABLE care_alerts; DROP TABLE care_runs; DROP TABLE care_plans; ALTER TABLE reminders DROP COLUMN question_id;');
    f.s.close(); reopened = new CareStore(path, f.clock);
    assert.equal(reopened.deviceStatus(f.phone.deviceToken).helpOpen, true);
    assert.equal(reopened.flow.alerts(f.identity).length, 1);
    assert(reopened.all('PRAGMA table_info(reminders)').some(c => c.name === 'question_id'));
    const receipt = reopened.ingest(f.phone.deviceToken, { eventId: randomUUID(), kind: 'checkin', observedAt: f.clock() });
    assert.equal(receipt.receivedAt, f.clock()); assert.equal(reopened.flow.alerts(f.identity)[0].resolvedAt, null);
  } finally {
    (reopened || f.s).close();
    assert.equal(resolve(dirname(directory)), resolve(tmpdir())); assert(basename(directory).startsWith('picocare-upgrade-'));
    rmSync(directory, { recursive: true });
  }
});
