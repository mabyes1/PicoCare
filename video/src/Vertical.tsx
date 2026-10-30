import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import React from 'react';
import { FONT } from './cards';
import { VO } from './captions';
import { CaptionBottom, EndCard, KenBurns, KineticLines, Shot } from './film';
import { WallScreen } from './phone';

// Vertical X cut, 1080x1920 @30fps, 40s = 1200 frames.
// Hook → proof → promise, with the same voice.
export const Vertical: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#0c1512', fontFamily: FONT }}>
      <Sequence from={0} durationInFrames={240}>
        <Shot dur={240} first>
          <KenBurns src="art-hero.jpg" dur={240} dim={0.5} />
          <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: '0 90px' }}>
            <KineticLines seg={0} voLocal={45} size={68} align="center" />
          </AbsoluteFill>
        </Shot>
      </Sequence>
      <Sequence from={228} durationInFrames={612}>
        <Shot dur={612}>
          <WallScreen scale={1.45} shiftY={-60} />
          <CaptionBottom seg={2} voLocal={42} />
        </Shot>
      </Sequence>
      <Sequence from={828} durationInFrames={372}>
        <Shot dur={372} last>
          <EndCard seg={7} voLocal={72} dur={372} />
        </Shot>
      </Sequence>
      {[0, 2, 7].map((s, k) => (
        <Sequence key={VO[s].file} from={[45, 270, 900][k]}>
          <Audio src={staticFile(VO[s].file)} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
