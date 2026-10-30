// Real-device footage manifest. Flip a flag when the file lands in video/public/,
// then re-render. Until then the shot uses the PC reconstruction.
export const FOOTAGE = {
  wall: false, // phone-wall.mp4
  weekly: false, // phone-weekly.mp4
  ask: false, // phone-ask.mp4
  care: false, // phone-care.mp4
};
export const FOOTAGE_FILE = {
  wall: 'phone-wall.mp4',
  weekly: 'phone-weekly.mp4',
  ask: 'phone-ask.mp4',
  care: 'phone-care.mp4',
} as const;
