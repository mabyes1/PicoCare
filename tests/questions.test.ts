import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { CareStore } from '../src/store.ts';
import { makeServer } from '../src/server.ts';
import { localQuestion } from '../src/questions.ts';

const now = Date.parse('2026-10-27T10:00:00Z');
function fixture(clock: () => number = () => now) {
  const store = new CareStore(':memory:', clock);
  const { identity } = store.createWorkspace({ kind: 'personal', label: '測試家庭', caregiverName: '照顧者' });
  const pairing = store.createPairing(identity, { displayName: '媽媽' });
  const phone = store.enroll({ code: pairing.code, requestId: randomUUID() });
  const question = store.ask(phone.personId, localQuestion(null, null, clock()));
  const reply = (optionId: string, extra: Record<string, unknown> = {}) => ({ eventId: randomUUID(), kind: 'question_answer', observedAt: clock(), questionId: question.id, optionId, ...extra });
  return { store, identity, phone, question, reply };
}

test('HTTP 問題只接受所屬手機的答案，沒有主動發問或聊天入口', async () => {
  const { store, phone, question, reply } = fixture(), server = makeServer(store);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string'); const base = `http://127.0.0.1:${address.port}`;
  const headers = { Authorization: `Bearer ${phone.deviceToken}`, 'Content-Type': 'application/json' };
  try {
    const status = await fetch(base + '/api/device/status', { headers }).then(r => r.json());
    assert.equal(status.question.id, question.id); assert.equal(status.question.options.length, 3);
    assert.equal(status.question.elseLabel, '以上都不符合'); assert.equal(status.question.maxElseLength, 200);
    assert.equal(status.question.options[0].intent, undefined);
    assert.equal((await fetch(base + '/api/device/chat', { method: 'POST', headers, body: JSON.stringify({ prompt: '新問題' }) })).status, 404);
    const response = await fetch(base + '/api/device/events', { method: 'POST', headers, body: JSON.stringify(reply('report_ok')) });
    assert.equal(response.status, 202);
    const answered = await fetch(base + '/api/device/status', { headers }).then(r => r.json());
    assert.equal(answered.question, null); assert.equal(answered.checkin, 'reported');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});

test('一般選項只能回 optionId；ELSE 需要有效短回答及問題 ID', () => {
  const { store, phone, reply } = fixture();
  try {
    assert.throws(() => store.ingest(phone.deviceToken, reply('report_ok', { elseText: '額外內容' })), /只有/);
    assert.throws(() => store.ingest(phone.deviceToken, reply('else', { elseText: '   ' })), /補充/);
    assert.throws(() => store.ingest(phone.deviceToken, reply('else', { elseText: '字'.repeat(201) })), /補充/);
    assert.throws(() => store.ingest(phone.deviceToken, reply('made_up')), /這一題提供/);
    assert.throws(() => store.ingest(phone.deviceToken, reply('report_ok', { questionId: undefined })), /問題代碼/);
    assert.throws(() => store.ingest(phone.deviceToken, reply('report_ok', { prompt: '另一個問題' })), /不支援/);
    assert.equal(store.get('SELECT count(*) AS n FROM events')!.n, 0);
  } finally { store.close(); }
});

test('ELSE 是單題證據，保留原文且不啟動新任務或自動確認平安', () => {
  const { store, phone, identity, question, reply } = fixture();
  try {
    const value = '我把手機留在家裡。順便告訴我天氣？';
    store.ingest(phone.deviceToken, reply('else', { elseText: value }));
    const detail = store.detail(identity, phone.personId), record = detail.questions.find(q => q.id === question.id)!;
    assert.equal(record.answer!.elseText, value); assert.equal(record.answer!.review, 'pending');
    assert.equal(detail.person.checkin, 'awaiting'); assert.equal(detail.person.helpOpen, false);
    assert.equal(store.deviceStatus(phone.deviceToken).question, null);
    assert.equal(store.get('SELECT count(*) AS n FROM questions')!.n, 1);
  } finally { store.close(); }
});

test('同一回答重送保留回執，一題不能被第二個答案覆蓋', () => {
  const { store, phone, identity, reply } = fixture();
  try {
    const answer = reply('busy'), first = store.ingest(phone.deviceToken, answer), retry = store.ingest(phone.deviceToken, answer);
    assert.equal(first.receiptId, retry.receiptId); assert.equal(retry.duplicate, true);
    assert.throws(() => store.ingest(phone.deviceToken, reply('report_ok')), /已經收到回答/);
    assert.equal(store.detail(identity, phone.personId).questions[0].answer!.review, 'deferred');
  } finally { store.close(); }
});

test('不能替別支手機回答；明確選擇請人聯絡會形成求助', () => {
  const { store, phone, identity, reply } = fixture();
  try {
    const pairing = store.createPairing(identity, { displayName: '爸爸' });
    const other = store.enroll({ code: pairing.code, requestId: randomUUID() });
    assert.throws(() => store.ingest(other.deviceToken, reply('contact')), /不屬於/);
    store.ingest(phone.deviceToken, reply('contact'));
    assert.equal(store.detail(identity, phone.personId).person.helpOpen, true);
    assert.equal(store.detail(identity, other.personId).person.helpOpen, false);
  } finally { store.close(); }
});

test('回答目前平安不關閉既有求助；直接報安停止等候問題', () => {
  const { store, phone, identity, reply } = fixture();
  try {
    store.ingest(phone.deviceToken, { eventId: randomUUID(), kind: 'help', observedAt: now });
    store.ingest(phone.deviceToken, reply('report_ok'));
    assert.equal(store.detail(identity, phone.personId).person.helpOpen, true);
    const next = store.ask(phone.personId, localQuestion(null, null, now));
    store.ingest(phone.deviceToken, { eventId: randomUUID(), kind: 'checkin', observedAt: now });
    assert.equal(store.deviceStatus(phone.deviceToken).question, null);
    assert.equal(store.get('SELECT status FROM questions WHERE id=?', next.id)!.status, 'closed_by_checkin');
  } finally { store.close(); }
});

test('離線晚到的答案保留，過期平安回答不當作目前已確認', () => {
  let clock = now; const { store, phone, identity, reply } = fixture(() => clock);
  try {
    const answer = reply('report_ok'); clock += 1800001;
    assert.equal(store.deviceStatus(phone.deviceToken).question, null);
    store.ingest(phone.deviceToken, answer);
    const detail = store.detail(identity, phone.personId);
    assert.equal(detail.questions[0].status, 'answered_late'); assert.equal(detail.questions[0].answer!.review, 'pending');
    assert.equal(detail.person.checkin, 'awaiting');
  } finally { store.close(); }
});

test('直接報安後才收到的離線求助選項仍保留求助責任', () => {
  const { store, phone, identity, reply } = fixture();
  try {
    const answer = reply('contact');
    store.ingest(phone.deviceToken, { eventId: randomUUID(), kind: 'checkin', observedAt: now });
    store.ingest(phone.deviceToken, answer);
    const detail = store.detail(identity, phone.personId);
    assert.equal(detail.person.helpOpen, true); assert.equal(detail.questions[0].answer!.review, 'needs_contact');
    assert.equal(detail.questions[0].status, 'answered_late');
  } finally { store.close(); }
});
