import type { Context } from './domain.ts';
import type { Lang } from './lang.ts';

export type QuestionOption = { id: string; label: string; intent: 'report_ok' | 'clarify' | 'needs_contact' | 'defer' };
export type QuestionDraft = { topic?: 'checkin' | 'video' | 'outing'; prompt: string; options: QuestionOption[] };
export const ELSE_ID = 'else';
export const MAX_ELSE_LENGTH = 200;
export function videoQuestion(lang: Lang = 'zh'): QuestionDraft {
  const en = lang === 'en';
  return { topic: 'video', prompt: en ? 'Saw clues of video playback just now — were you watching and forgot to reply?' : '剛才有影音播放的線索，是看影片忘記回覆了嗎？', options: [
    { id: 'video_forgot', label: en ? 'Yes, I was watching and forgot; no help needed' : '對，剛才看影片忘了回，目前不需協助', intent: 'report_ok' },
    { id: 'busy', label: en ? "I'm busy with something else, reply later" : '我在忙別的事，晚點回覆', intent: 'defer' },
    { id: 'contact', label: en ? 'Please have family contact me' : '請家人聯絡我', intent: 'needs_contact' }
  ] };
}
export function outingQuestion(lang: Lang = 'zh'): QuestionDraft {
  const en = lang === 'en';
  return { topic: 'outing', prompt: en ? 'Recent fixes kept passing near the same area, and the phone is low on battery. Still browsing, or having trouble finding your way?' : '近期定位重複經過附近，手機也快沒電了。還在逛，還是找路不太順？', options: [
    { id: 'outing_ok', label: en ? "Still browsing, don't need help for now" : '我還在逛，暫時不需要幫忙', intent: 'clarify' },
    { id: 'outing_contact', label: en ? "I'm finding my way, please have family contact me" : '我在找路，請家人聯絡我', intent: 'needs_contact' },
    { id: 'busy', label: en ? "Can't answer now, talk later" : '現在不方便回答，晚點再說', intent: 'defer' }
  ] };
}
export function metaOutingQuestion(title: string, lang: Lang = 'zh'): QuestionDraft {
  const en = lang === 'en';
  const clean = title.trim().replace(en ? /[.?]$/ : /[。？]$/, '');
  return { topic: 'outing', prompt: en ? `${clean}, still going smoothly?` : `${clean}，現在還順利嗎？`, options: [
    { id: 'outing_ok', label: en ? "Still browsing, don't need help for now" : '我還在逛，暫時不需要幫忙', intent: 'clarify' },
    { id: 'outing_contact', label: en ? "I'm finding my way, please have family contact me" : '我在找路，請家人聯絡我', intent: 'needs_contact' },
    { id: 'busy', label: en ? "Can't answer now, talk later" : '現在不方便回答，晚點再說', intent: 'defer' }
  ] };
}
export function missedCheckinQuestion(lang: Lang = 'zh'): QuestionDraft {
  const en = lang === 'en';
  return { prompt: en ? "Haven't received your check-in today. Convenient to reply now?" : '今天還沒收到你的報安，現在方便回覆一下嗎？', options: [
    { id: 'report_ok', label: en ? "I don't need help right now" : '我目前不需要協助', intent: 'report_ok' },
    { id: 'busy', label: en ? "I'm busy now, reply later" : '我現在忙，晚點回覆', intent: 'defer' },
    { id: 'contact', label: en ? 'Please have my caregiver contact me' : '請照顧者聯絡我', intent: 'needs_contact' }
  ] };
}

// Development templates until Meta credits arrive. A reply always belongs to one question.
export function localQuestion(context: Context | null, observedAt: number | null, now: number, lang: Lang = 'zh'): QuestionDraft {
  const en = lang === 'en';
  const recent = context && observedAt !== null && now - observedAt <= 120000;
  const prompt = recent && context.batteryPercent !== null && context.batteryPercent <= 15 && context.charging === false
    ? (en ? 'Phone battery is low. Which best matches how you are doing?' : '手機電量比較低。你現在的情況，哪個最符合？')
    : (en ? 'Want to check on you — which best matches how you are doing?' : '想關心你一下，你現在的情況，哪個最符合？');
  return { prompt, options: [
    { id: 'report_ok', label: en ? "I'm okay for now, no help needed" : '我現在平安，暫時不需要協助', intent: 'report_ok' },
    { id: 'busy', label: en ? "Can't answer now, talk later" : '現在不方便回答，晚點再說', intent: 'defer' },
    { id: 'contact', label: en ? 'I want my caregiver to contact me' : '我想請照顧者聯絡我', intent: 'needs_contact' }
  ] };
}
