import { AbsoluteFill, Audio, Sequence, interpolate, staticFile } from 'remotion';
import React from 'react';
import { FONT } from './cards';
import { MAIN_DURATION_FRAMES, SHOT_AT, SHOT_DUR, VO, VO_AT, VO_LOCAL } from './captions';
import {
  CaregiverTriptychShot,
  ColdOpenProblem,
  ElderHomeShot,
  EndCard,
  Pipeline,
  Reveal,
  Shot,
  WallFeedShot,
  WeeklyReviewShot,
} from './film';

// Tight, zero-dead-air submission film: 1920x1080 @30fps, 3270 frames (109.0s).
// Every shot's duration matches its natural voiceover + a 0.8s musical breath,
// accompanied by warm felt-piano & ambient pad background music.
export const Main: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#0c1512', fontFamily: FONT }}>
      <Sequence from={SHOT_AT[0]} durationInFrames={SHOT_DUR[0]}>
        <Shot dur={SHOT_DUR[0]} first>
          <ColdOpenProblem seg={0} voLocal={VO_LOCAL} dur={SHOT_DUR[0]} />
        </Shot>
      </Sequence>

      <Sequence from={SHOT_AT[1]} durationInFrames={SHOT_DUR[1]}>
        <Shot dur={SHOT_DUR[1]}>
          <Reveal seg={1} voLocal={VO_LOCAL} />
        </Shot>
      </Sequence>

      <Sequence from={SHOT_AT[2]} durationInFrames={SHOT_DUR[2]}>
        <Shot dur={SHOT_DUR[2]}>
          <ElderHomeShot seg={2} voLocal={VO_LOCAL} dur={SHOT_DUR[2]} />
        </Shot>
      </Sequence>

      <Sequence from={SHOT_AT[3]} durationInFrames={SHOT_DUR[3]}>
        <Shot dur={SHOT_DUR[3]}>
          <WallFeedShot seg={3} voLocal={VO_LOCAL} dur={SHOT_DUR[3]} />
        </Shot>
      </Sequence>

      <Sequence from={SHOT_AT[4]} durationInFrames={SHOT_DUR[4]}>
        <Shot dur={SHOT_DUR[4]}>
          <WeeklyReviewShot seg={4} voLocal={VO_LOCAL} dur={SHOT_DUR[4]} />
        </Shot>
      </Sequence>

      <Sequence from={SHOT_AT[5]} durationInFrames={SHOT_DUR[5]}>
        <Shot dur={SHOT_DUR[5]}>
          <CaregiverTriptychShot seg={5} voLocal={VO_LOCAL} dur={SHOT_DUR[5]} />
        </Shot>
      </Sequence>

      <Sequence from={SHOT_AT[6]} durationInFrames={SHOT_DUR[6]}>
        <Shot dur={SHOT_DUR[6]}>
          <Pipeline seg={6} voLocal={VO_LOCAL} dur={SHOT_DUR[6]} />
        </Shot>
      </Sequence>

      <Sequence from={SHOT_AT[7]} durationInFrames={SHOT_DUR[7]}>
        <Shot dur={SHOT_DUR[7]} last>
          <EndCard seg={7} voLocal={VO_LOCAL} dur={SHOT_DUR[7]} />
        </Shot>
      </Sequence>

      <Audio
        src={staticFile('bgm.mp3')}
        volume={(f) => {
          const fadeIn = interpolate(f, [0, 8], [0, 0.48], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const fadeOut = interpolate(f, [MAIN_DURATION_FRAMES - 66, MAIN_DURATION_FRAMES], [0.48, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          return Math.min(fadeIn, fadeOut);
        }}
      />

      {VO.map((v, i) => (
        <Sequence key={v.file} from={VO_AT[i]}>
          <Audio src={staticFile(v.file)} volume={1.25} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
