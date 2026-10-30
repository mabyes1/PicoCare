// Voiceover data: ffprobe durations + edge-tts VTT cue times (seconds, segment-local).
export type VoCue = { start: number; end: number; zh: string; en: string };
export type VoSeg = { file: string; dur: number; cues: VoCue[] };
export const VO: VoSeg[] = [
  { file: 'vo-0.mp3', dur: 3.216, cues: [
    { start: 0.1, end: 3.2, zh: '有人在關心，但不想打擾。', en: 'Someone cares, without intruding.' },
  ] },
  { file: 'vo-1.mp3', dur: 10.464, cues: [
    { start: 0.1, end: 4.687, zh: '獨居的媽媽，一天沒消息，你只能乾著急。', en: 'Her mom lives alone. A day of silence, and all you can do is worry.' },
    { start: 4.637, end: 7.362, zh: '裝監控，侵犯隱私。', en: 'Cameras invade privacy.' },
    { start: 7.362, end: 10.4, zh: '定時問候，又像在查勤。', en: 'Scheduled check-ins feel like roll calls.' },
  ] },
  { file: 'vo-2.mp3', dur: 12.504, cues: [
    { start: 0.1, end: 2.587, zh: 'PicoCare 換了一個做法。', en: 'PicoCare takes a different path.' },
    { start: 2.537, end: 7.137, zh: '手機默默看，秘書動腦想，家人放心忙。', en: 'The phone watches quietly. The secretary thinks. The family rests easy.' },
    { start: 7.137, end: 12.45, zh: '秘書每天把發現寫成動態，每一則後面都掛著證據。', en: 'Every day the secretary posts findings — each backed by evidence.' },
  ] },
  { file: 'vo-3.mp3', dur: 11.112, cues: [
    { start: 0.1, end: 4.462, zh: '早上八點二十五，第一次看到手機亮起來。', en: '8:25 AM: the first sign of the phone lighting up.' },
    { start: 4.412, end: 7.637, zh: '半夜十二點，手機還亮著。', en: 'Midnight: the phone is still on.' },
    { start: 7.637, end: 11.062, zh: '只針對事實發揮，絕不捏造。', en: 'Only facts. Never invented.' },
  ] },
  { file: 'vo-4.mp3', dur: 10.056, cues: [
    { start: 0.1, end: 6.062, zh: '每個星期，Meta 把一週的動態讀完，寫成一段家人看得懂的話。', en: "Every week, Meta reads seven days of findings into one paragraph the family can understand." },
    { start: 6.012, end: 10.0, zh: '不裝神祕，直說是開源模型整理的。', en: 'No mystery: it says plainly it was the open model.' },
  ] },
  { file: 'vo-5.mp3', dur: 11.232, cues: [
    { start: 0.1, end: 3.137, zh: '照顧者看到的是同一個 Ken。', en: 'The caregiver sees the same Ken.' },
    { start: 3.087, end: 7.65, zh: '求助、時間線、處理結果，都在這裡。', en: 'Help, timeline, resolution — all here.' },
    { start: 7.65, end: 11.162, zh: '先問本人，釐不清才找家人。', en: 'Ask the person first. Only then the family.' },
  ] },
  { file: 'vo-6.mp3', dur: 12.168, cues: [
    { start: 0.1, end: 4.037, zh: '本地規則先守門，證據不夠就閉嘴。', en: 'Local rules stand guard: thin evidence means silence.' },
    { start: 3.987, end: 8.062, zh: 'Meta 融合多條弱訊號，寫成一句關心。', en: 'Meta fuses weak signals into one caring line.' },
    { start: 8.062, end: 12.1, zh: '拔掉 Meta，秘書就變回只會問候的鬧鐘。', en: 'Remove Meta and the secretary degrades into a greeting alarm.' },
  ] },
  { file: 'vo-7.mp3', dur: 4.608, cues: [
    { start: 0.1, end: 3.037, zh: '不碰醫療，只做關懷。', en: 'No medical advice. Only care.' },
    { start: 2.987, end: 4.537, zh: 'PicoCare。', en: 'PicoCare.' },
  ] },
];
// Absolute VO start frames in Main (30fps).
export const VO_AT = [45, 330, 870, 1560, 2460, 3210, 3960, 4860];
