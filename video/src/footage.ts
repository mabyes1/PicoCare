// Real-device stills manifest. Captured 2026-10-30 from the frozen build
// (tw.picocare.meta + tw.picocare.meta.care, Ken's live data).
export const FOOTAGE = {
  home: true,
  wall: true,
  weekly: true,
  ask: false,
  care: true,
};
export const STILLS = {
  home: ['phone-home.png'],
  wall: ['phone-insight.png', 'phone-wall.png'],
  weekly: ['phone-insight.png'],
  ask: [] as string[],
  care: ['phone-care-list.png', 'phone-care-detail.png', 'phone-care-actions.png'],
} as const;
