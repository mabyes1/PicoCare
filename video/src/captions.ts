// English voiceover (en-US-AvaMultilingualNeural): ffprobe durations + cue times (seconds, segment-local).
export type VoCue = { start: number; end: number; zh: string; en: string };
export type VoSeg = { file: string; dur: number; cues: VoCue[] };

export const VO: VoSeg[] = [
  {
    file: 'vo-en-0.mp3',
    dur: 10.224,
    cues: [
      { start: 0.05, end: 5.133, zh: 'When an aging parent lives alone, a whole day of silence makes your heart race.', en: '' },
      { start: 5.133, end: 10.169, zh: 'Yet cameras invade their privacy, and daily check-in alarms feel like a roll call.', en: '' },
    ],
  },
  {
    file: 'vo-en-1.mp3',
    dur: 12.288,
    cues: [
      { start: 0.05, end: 4.648, zh: 'So we built PicoCare — a personal care secretary for aging parents.', en: '' },
      { start: 4.648, end: 7.208, zh: 'The phone watches quietly on-device.', en: '' },
      { start: 7.208, end: 9.805, zh: 'The secretary thinks with Meta AI.', en: '' },
      { start: 9.805, end: 12.233, zh: 'And the family finally rests easy.', en: '' },
    ],
  },
  {
    file: 'vo-en-2.mp3',
    dur: 13.56,
    cues: [
      { start: 0.05, end: 4.587, zh: "On Ken's phone, there are no complex menus or open-ended chatbots.", en: '' },
      { start: 4.587, end: 7.475, zh: 'He can check in or request help in one tap.', en: '' },
      { start: 7.475, end: 13.507, zh: 'When something changes, PicoCare asks him first with simple options, respecting his autonomy.', en: '' },
    ],
  },
  {
    file: 'vo-en-3.mp3',
    dur: 17.16,
    cues: [
      { start: 0.05, end: 4.866, zh: 'Throughout the day, the secretary turns real phone clues into a living feed.', en: '' },
      { start: 4.866, end: 8.919, zh: '8:25 AM: the screen lights up for the first time.', en: '' },
      { start: 8.919, end: 11.662, zh: 'Midnight: the phone is still active.', en: '' },
      { start: 11.662, end: 17.111, zh: 'Every post cites its exact timestamp and on-device evidence — never invented.', en: '' },
    ],
  },
  {
    file: 'vo-en-4.mp3',
    dur: 11.616,
    cues: [
      { start: 0.05, end: 6.893, zh: "And once a week, Meta's open-weight model reads seven days of findings into one warm paragraph for the family.", en: '' },
      { start: 6.893, end: 11.553, zh: 'No mystery: it states plainly that it was crafted by the open model.', en: '' },
    ],
  },
  {
    file: 'vo-en-5.mp3',
    dur: 11.352,
    cues: [
      { start: 0.05, end: 3.919, zh: 'On the caregiver app, family members see the exact same Ken.', en: '' },
      { start: 3.919, end: 11.286, zh: 'Help requests, the weekly review, and the evidence timeline are all in one place, ready to mark seen and log follow-up calls.', en: '' },
    ],
  },
  {
    file: 'vo-en-6.mp3',
    dur: 17.16,
    cues: [
      { start: 0.05, end: 5.279, zh: 'Under the hood, local rules stand guard: thin evidence means silence.', en: '' },
      { start: 5.279, end: 11.444, zh: 'Meta Muse fuses weak signals into one caring question, and triages free-text replies.', en: '' },
      { start: 11.444, end: 17.111, zh: "Without Meta, it's just an alarm; with Meta, it's a thoughtful secretary.", en: '' },
    ],
  },
  {
    file: 'vo-en-7.mp3',
    dur: 5.448,
    cues: [
      { start: 0.05, end: 1.674, zh: 'No medical advice.', en: '' },
      { start: 1.674, end: 3.337, zh: 'No false alarms.', en: '' },
      { start: 3.337, end: 4.356, zh: 'Only care.', en: '' },
      { start: 4.356, end: 5.4, zh: 'PicoCare.', en: '' },
    ],
  },
];

// Tight, zero-dead-air shot schedule (3270 frames = 109.0s @ 30fps)
export const SHOT_AT = [0, 342, 744, 1184, 1732, 2114, 2490, 3038] as const;
export const SHOT_DUR = [354, 414, 452, 560, 394, 388, 560, 232] as const;
export const VO_LOCAL = 21;
export const VO_AT = SHOT_AT.map((s) => s + VO_LOCAL);
export const MAIN_DURATION_FRAMES = 3270;
export const VERTICAL_DURATION_FRAMES = 1080;
