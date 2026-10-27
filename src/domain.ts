export type WorkspaceKind = 'personal' | 'institution';
import type { PhoneContext } from '../shared/protocol.ts';
import { ELSE_ID, MAX_ELSE_LENGTH } from './questions.ts';
export type Context = PhoneContext;
export type DeviceEvent = {
  eventId: string;
  kind: 'context' | 'checkin' | 'help' | 'reminder_result' | 'question_answer';
  observedAt: number;
  context?: Context;
  reminderId?: string;
  result?: 'executed' | 'declined';
  questionId?: string;
  optionId?: string;
  elseText?: string;
};
export class Problem extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export function demand(condition: unknown, message: string, status = 400): asserts condition {
  if (!condition) throw new Problem(status, message);
}
export function object(value: unknown): Record<string, unknown> {
  demand(value !== null && typeof value === 'object' && !Array.isArray(value), '需要 JSON 物件');
  return value as Record<string, unknown>;
}
export function text(value: unknown, name: string, max = 100): string {
  demand(typeof value === 'string' && value.trim().length > 0 && value.length <= max, `${name}格式不正確`);
  return value.trim();
}
export function oneOf<const T extends readonly string[]>(value: unknown, choices: T, name: string): T[number] {
  demand(typeof value === 'string' && choices.includes(value), `${name}格式不正確`);
  return value as T[number];
}
export function dateTime(value: unknown, now: number): number {
  demand(typeof value === 'number' && Number.isSafeInteger(value) && value >= now - 7 * 86400000 && value <= now + 120000, '資料時間超出允許範圍');
  return value;
}
function nullableBoolean(value: unknown, name: string): boolean | null {
  demand(value === null || typeof value === 'boolean', `${name}格式不正確`); return value as boolean | null;
}
export function parseEvent(value: unknown, now: number): DeviceEvent {
  const b = object(value);
  const kind = oneOf(b.kind, ['context', 'checkin', 'help', 'reminder_result', 'question_answer'], '事件');
  const eventId = text(b.eventId, '事件代碼', 80);
  demand(/^[a-zA-Z0-9_-]{8,80}$/.test(eventId), '事件代碼格式不正確');
  const event: DeviceEvent = { eventId, kind, observedAt: dateTime(b.observedAt, now) };
  const allowed = new Set(['eventId', 'kind', 'observedAt', ...(kind === 'context' ? ['context'] : kind === 'reminder_result' ? ['reminderId', 'result'] : kind === 'question_answer' ? ['questionId', 'optionId', 'elseText'] : [])]);
  demand(Object.keys(b).every(k => allowed.has(k)), '事件含有不支援的欄位');
  if (kind === 'question_answer') {
    event.questionId = text(b.questionId, '問題代碼', 80);
    event.optionId = text(b.optionId, '答案選項', 40);
    if (event.optionId === ELSE_ID) event.elseText = text(b.elseText, '這一題的補充', MAX_ELSE_LENGTH);
    else demand(b.elseText === undefined, '只有「以上都不符合」可以補充文字');
  }
  if (kind === 'reminder_result') {
    event.reminderId = text(b.reminderId, '提醒代碼', 80);
    event.result = oneOf(b.result, ['executed', 'declined'], '執行結果');
  }
  if (kind === 'context') {
    const c = object(b.context);
    const keys = ['batteryPercent', 'charging', 'network', 'screenInteractive', 'ringer', 'motion', 'motionEvidence', 'sources', 'usage', 'media', 'location', 'notifications', 'sharing'];
    demand(Object.keys(c).every(k => keys.includes(k)), '情境含有不支援的欄位');
    demand(c.batteryPercent === null || typeof c.batteryPercent === 'number' && Number.isInteger(c.batteryPercent) && c.batteryPercent >= 0 && c.batteryPercent <= 100, '電量格式不正確');
    const sharing = oneOf(c.sharing, ['summary', 'detailed'], '分享方式');
    demand(Array.isArray(c.notifications) && c.notifications.length <= 6, '通知最多六筆');
    const notifications = c.notifications.map((value: unknown) => {
      const n = object(value);
      demand(Object.keys(n).every(k => ['category', 'text', 'observedAt', 'postedAt'].includes(k)), '通知含有不支援的欄位');
      const category = oneOf(n.category, ['navigation', 'call', 'other'], '通知類型');
      const observedAt = dateTime(n.observedAt, now);
      demand(observedAt <= event.observedAt + 5000, '通知時間晚於情境時間');
      demand(n.text === undefined || sharing === 'detailed', '摘要模式不接收通知原文');
      if (n.postedAt !== undefined) demand(typeof n.postedAt === 'number' && Number.isSafeInteger(n.postedAt) && n.postedAt >= 0 && n.postedAt <= observedAt + 5000, '通知發布時間格式不正確');
      return { category, observedAt, ...(n.postedAt === undefined ? {} : { postedAt: n.postedAt as number }), ...(n.text === undefined ? {} : { text: text(n.text, '通知內容', 300) }) };
    });
    let location: Context['location'] = null;
    if (c.location !== null) {
      demand(sharing === 'detailed', '摘要模式不接收精確位置');
      const p = object(c.location);
      demand(Object.keys(p).every(k => ['latitude', 'longitude', 'accuracy', 'observedAt'].includes(k)), '位置含有不支援的欄位');
      demand(typeof p.latitude === 'number' && Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90, '緯度格式不正確');
      demand(typeof p.longitude === 'number' && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180, '經度格式不正確');
      demand(typeof p.accuracy === 'number' && Number.isFinite(p.accuracy) && p.accuracy >= 0, '位置精度格式不正確');
      const observedAt = dateTime(p.observedAt, now);
      demand(observedAt <= event.observedAt + 5000, '位置時間晚於情境時間');
      location = { latitude: p.latitude, longitude: p.longitude, accuracy: p.accuracy, observedAt };
    }
    let motionEvidence: Context['motionEvidence'];
    if (c.motionEvidence !== undefined) {
      motionEvidence = null;
      if (c.motionEvidence !== null) {
        const m = object(c.motionEvidence);
        demand(Object.keys(m).every(k => ['observedAt', 'accuracy', 'speed', 'speedAccuracy'].includes(k)), '移動依據含有不支援的欄位');
        for (const key of ['accuracy', 'speed', 'speedAccuracy']) demand(typeof m[key] === 'number' && Number.isFinite(m[key]) && (m[key] as number) >= 0, '移動精度格式不正確');
        const observedAt = dateTime(m.observedAt, now);
        demand(observedAt <= event.observedAt + 5000, '移動時間晚於情境時間');
        motionEvidence = { observedAt, accuracy: m.accuracy as number, speed: m.speed as number, speedAccuracy: m.speedAccuracy as number };
      }
    }
    let sources: Context['sources'];
    if (c.sources !== undefined) {
      const s = object(c.sources);
      demand(Object.keys(s).every(k => ['notifications', 'location', 'usage', 'media'].includes(k)), '來源含有不支援的欄位');
      const states = ['available', 'disabled', 'permission_missing', 'disconnected', 'no_fix', 'stale', 'inaccurate', 'speed_unavailable', 'error'] as const;
      sources = { notifications: oneOf(s.notifications, states, '通知來源'), location: oneOf(s.location, states, '定位來源'),
        ...(s.usage === undefined ? {} : { usage: oneOf(s.usage, states, 'App 使用來源') }), ...(s.media === undefined ? {} : { media: oneOf(s.media, states, '媒體來源') }) };
    }
    let usage: Context['usage'], media: Context['media'];
    if (c.usage !== undefined) {
      usage = null;
      if (c.usage !== null) {
        const u = object(c.usage); demand(Object.keys(u).every(k => ['appId', 'category', 'observedAt', 'changedAt'].includes(k)), 'App 使用含有不支援的欄位');
        const observedAt = dateTime(u.observedAt, now), changedAt = dateTime(u.changedAt, now);
        demand(observedAt <= event.observedAt && changedAt <= observedAt, 'App 使用時間不正確');
        usage = { appId: text(u.appId, 'App 代碼', 160), category: oneOf(u.category, ['video', 'other'], 'App 分類'), observedAt, changedAt };
      }
    }
    if (c.media !== undefined) {
      media = null;
      if (c.media !== null) {
        const m = object(c.media); demand(Object.keys(m).every(k => ['appId', 'state', 'observedAt'].includes(k)), '媒體含有不支援的欄位');
        const observedAt = dateTime(m.observedAt, now); demand(observedAt <= event.observedAt, '媒體時間不正確');
        media = { appId: text(m.appId, '媒體 App', 160), state: oneOf(m.state, ['playing', 'paused', 'stopped', 'unknown'], '播放狀態'), observedAt };
      }
    }
    event.context = {
      batteryPercent: c.batteryPercent as number | null, charging: nullableBoolean(c.charging, '充電'),
      screenInteractive: nullableBoolean(c.screenInteractive, '可互動狀態'),
      network: oneOf(c.network, ['online', 'offline', 'unknown'], '網路'),
      ringer: oneOf(c.ringer, ['normal', 'vibrate', 'silent', 'unknown'], '鈴聲'),
      motion: oneOf(c.motion, ['moving', 'stationary', 'unknown'], '移動'), location, notifications, sharing,
      ...(motionEvidence === undefined ? {} : { motionEvidence }), ...(sources === undefined ? {} : { sources }),
      ...(usage === undefined ? {} : { usage }), ...(media === undefined ? {} : { media })
    };
  }
  return event;
}
export function dayAt(time: number, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(time);
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}
