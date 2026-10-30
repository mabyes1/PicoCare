// English voiceover: ffprobe durations + edge-tts VTT cue times (seconds, segment-local).
export type VoCue = { start: number; end: number; zh: string; en: string };
export type VoSeg = { file: string; dur: number; cues: VoCue[] };
export const VO: VoSeg[] = [
  { file: 'vo-en-0.mp3', dur: 3.072, cues: [
    { start: 0.100, end: 3.062, zh: 'Someone cares, without intruding.', en: '' },
  ] },
  { file: 'vo-en-1.mp3', dur: 11.424, cues: [
    { start: 0.100, end: 2.225, zh: 'Her mom lives alone.', en: '' },
    { start: 2.175, end: 5.862, zh: 'A day of silence, and all you can do is worry.', en: '' },
    { start: 5.862, end: 8.300, zh: 'Cameras invade privacy.', en: '' },
    { start: 8.300, end: 11.375, zh: 'Scheduled check-ins feel like roll calls.', en: '' },
  ] },
  { file: 'vo-en-2.mp3', dur: 15.840, cues: [
    { start: 0.100, end: 2.850, zh: 'PicoCare takes a different path.', en: '' },
    { start: 2.800, end: 5.250, zh: 'The phone watches quietly.', en: '' },
    { start: 5.250, end: 7.512, zh: 'The secretary thinks.', en: '' },
    { start: 7.512, end: 9.862, zh: 'The family rests easy.', en: '' },
    { start: 9.862, end: 15.787, zh: 'Every day, the secretary posts what it found, and every post carries its evidence.', en: '' },
  ] },
  { file: 'vo-en-3.mp3', dur: 10.992, cues: [
    { start: 0.100, end: 4.337, zh: '8:25 AM: the first sign of the phone lighting up.', en: '' },
    { start: 4.287, end: 7.125, zh: 'Midnight: the phone is still on.', en: '' },
    { start: 7.125, end: 9.000, zh: 'Only facts.', en: '' },
    { start: 9.000, end: 10.937, zh: 'Never invented.', en: '' },
  ] },
  { file: 'vo-en-4.mp3', dur: 10.200, cues: [
    { start: 0.100, end: 6.350, zh: 'Every week, Meta reads seven days of findings into one paragraph the family can understand.', en: '' },
    { start: 6.300, end: 10.137, zh: 'No mystery: it says plainly it was the open model.', en: '' },
  ] },
  { file: 'vo-en-5.mp3', dur: 11.664, cues: [
    { start: 0.100, end: 2.825, zh: 'The caregiver sees the same Ken.', en: '' },
    { start: 2.775, end: 7.275, zh: 'Help requests, the timeline, what happened next, all here.', en: '' },
    { start: 7.275, end: 9.525, zh: 'Ask the person first.', en: '' },
    { start: 9.525, end: 11.600, zh: 'Only then the family.', en: '' },
  ] },
  { file: 'vo-en-6.mp3', dur: 12.720, cues: [
    { start: 0.100, end: 4.425, zh: 'Local rules stand guard: thin evidence means silence.', en: '' },
    { start: 4.375, end: 8.075, zh: 'Meta fuses weak signals into one caring line.', en: '' },
    { start: 8.075, end: 12.662, zh: 'Remove Meta, and the secretary degrades into a greeting alarm.', en: '' },
  ] },
  { file: 'vo-en-7.mp3', dur: 5.712, cues: [
    { start: 0.100, end: 2.237, zh: 'No medical advice.', en: '' },
    { start: 2.187, end: 3.912, zh: 'Only care.', en: '' },
    { start: 3.912, end: 5.650, zh: 'PicoCare.', en: '' },
  ] },
];
export const VO_AT = [45, 330, 870, 1560, 2460, 3210, 3960, 4860];
