import { AbsoluteFill, Audio, Sequence, interpolate, staticFile } from 'remotion';
import React from 'react';
import { FONT } from './cards';
import { VERTICAL_DURATION_FRAMES, VO } from './captions';
import { CaptionBottom, FocusedPhone, KenBurns, Kicker, KineticLines, Shot } from './film';
import { STILLS } from './footage';

// Vertical X cut, 1080x1920 @30fps, 36s = 1080 frames.
// Zero dead air: Hook (seg 0) → Live App Proof (seg 3) → Promise (seg 7) + BGM.
export const Vertical: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#0c1512', fontFamily: FONT }}>
      <Sequence from={0} durationInFrames={336}>
        <Shot dur={336} first>
          <KenBurns src="art-worry.jpg" dur={336} dim={0.46} />
          <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(8,14,11,0.55) 0%, rgba(8,14,11,0.88) 100%)' }} />
          <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: '0 76px' }}>
            <div style={{ marginBottom: 28 }}>
              <Kicker zh="PICOCARE · ELDER CARE" />
            </div>
            <KineticLines seg={0} voLocal={15} size={58} align="center" />
          </AbsoluteFill>
        </Shot>
      </Sequence>

      <Sequence from={324} durationInFrames={540}>
        <Shot dur={540}>
          <AbsoluteFill style={{ backgroundColor: '#0c1612', alignItems: 'center', justifyContent: 'space-between', padding: '88px 56px 230px' }}>
            <div style={{ textAlign: 'center' }}>
              <Kicker zh="LIVE FIELD DATA · META MUSE + OPEN WEIGHTS" />
              <div style={{ fontSize: 44, fontWeight: 900, color: 'white', marginTop: 14 }}>
                Every Finding Cites Its Evidence
              </div>
            </div>
            <FocusedPhone
              src={STILLS.wall[0]}
              secondSrc={STILLS.wall[1]}
              switchAt={170}
              dur={540}
              width={660}
              height={1320}
              zoomFrom={1.0}
              zoomTo={1.1}
              panYFrom={0}
              panYTo={-24}
            />
          </AbsoluteFill>
          <CaptionBottom seg={3} voLocal={12} />
        </Shot>
      </Sequence>

      <Sequence from={852} durationInFrames={228}>
        <Shot dur={228} last>
          <KenBurns src="art-hero.jpg" dur={228} dim={0.62} />
          <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: '0 72px', textAlign: 'center' }}>
            <div style={{ fontSize: 108, fontWeight: 900, color: 'white' }}>PicoCare</div>
            <div style={{ fontSize: 44, fontWeight: 800, color: '#cfe8da', marginTop: 18, lineHeight: 1.3 }}>
              No medical advice.
              <br />
              No false alarms. Only care.
            </div>
            <div style={{ fontSize: 24, color: '#9db8a8', marginTop: 28, fontWeight: 700 }}>
              Built with Meta Muse Spark & Open Weights
            </div>
          </AbsoluteFill>
        </Shot>
      </Sequence>

      <Audio
        src={staticFile('bgm.mp3')}
        volume={(f) => {
          const fadeIn = interpolate(f, [0, 8], [0, 0.48], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const fadeOut = interpolate(f, [VERTICAL_DURATION_FRAMES - 54, VERTICAL_DURATION_FRAMES], [0.48, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          return Math.min(fadeIn, fadeOut);
        }}
      />

      {[0, 3, 7].map((s, k) => (
        <Sequence key={VO[s].file} from={[15, 336, 870][k]}>
          <Audio src={staticFile(VO[s].file)} volume={1.25} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
