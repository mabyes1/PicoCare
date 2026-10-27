import type { Context } from './domain.ts';

export type QuestionOption = { id: string; label: string; intent: 'report_ok' | 'clarify' | 'needs_contact' | 'defer' };
export type QuestionDraft = { topic?: 'checkin' | 'video' | 'outing'; prompt: string; options: QuestionOption[] };
export const ELSE_ID = 'else';
export const MAX_ELSE_LENGTH = 200;
export function videoQuestion(): QuestionDraft {
  return { topic: 'video', prompt: '剛才有影音播放的線索，是看影片忘記回覆了嗎？', options: [
    { id: 'video_forgot', label: '對，剛才看影片忘了回，目前不需協助', intent: 'report_ok' },
    { id: 'busy', label: '我在忙別的事，晚點回覆', intent: 'defer' },
    { id: 'contact', label: '請家人聯絡我', intent: 'needs_contact' }
  ] };
}
export function outingQuestion(): QuestionDraft {
  return { topic: 'outing', prompt: '近期定位重複經過附近，手機也快沒電了。還在逛，還是找路不太順？', options: [
    { id: 'outing_ok', label: '我還在逛，暫時不需要幫忙', intent: 'clarify' },
    { id: 'outing_contact', label: '我在找路，請家人聯絡我', intent: 'needs_contact' },
    { id: 'busy', label: '現在不方便回答，晚點再說', intent: 'defer' }
  ] };
}
export function missedCheckinQuestion(): QuestionDraft {
  return { prompt: '今天預定的報安還沒收到，現在方便回覆一下嗎？', options: [
    { id: 'report_ok', label: '我目前不需要協助', intent: 'report_ok' },
    { id: 'busy', label: '我現在忙，晚點回覆', intent: 'defer' },
    { id: 'contact', label: '請照顧者聯絡我', intent: 'needs_contact' }
  ] };
}

// Development templates until Meta credits arrive. A reply always belongs to one question.
export function localQuestion(context: Context | null, observedAt: number | null, now: number): QuestionDraft {
  const recent = context && observedAt !== null && now - observedAt <= 120000;
  const prompt = recent && context.batteryPercent !== null && context.batteryPercent <= 15 && context.charging === false
    ? '手機電量比較低。你現在的情況，哪個最符合？'
    : '想關心你一下，你現在的情況，哪個最符合？';
  return { prompt, options: [
    { id: 'report_ok', label: '我現在平安，暫時不需要協助', intent: 'report_ok' },
    { id: 'busy', label: '現在不方便回答，晚點再說', intent: 'defer' },
    { id: 'contact', label: '我想請照顧者聯絡我', intent: 'needs_contact' }
  ] };
}
