import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import React from 'react';
import { FONT } from './cards';
import { VO, VO_AT } from './captions';
import { EndCard, KenBurns, Kicker, KineticLines, PhoneShot, Pipeline, Reveal, Shot } from './film';

// 3-minute submission film, 1920x1080 @30fps = 5400 frames.
// Audio-first timeline: every shot is laid out around its VO segment,
// with 12-frame crossfades between shots.
const ColdOpen: React.FC<{ seg: number; voLocal: number; dur: number }> = ({ seg, voLocal, dur }) => (
  <AbsoluteFill>
    <KenBurns src="art-hero.jpg" dur={dur} dim={0.5} />
    <AbsoluteFill style={{ justifyContent: 'flex-end', padding: '0 110px 120px' }}>
      <KineticLines seg={seg} voLocal={voLocal} size={76} />
    </AbsoluteFill>
  </AbsoluteFill>
);

const Problem: React.FC<{ seg: number; voLocal: number; dur: number }> = ({ seg, voLocal, dur }) => (
  <AbsoluteFill>
    <KenBurns src="art-worry.jpg" dur={dur} dim={0.35} />
    <AbsoluteFill style={{ background: 'linear-gradient(transparent 30%, rgba(6,12,9,0.88) 72%)' }} />
    <AbsoluteFill style={{ justifyContent: 'flex-end', padding: '0 110px 110px' }}>
      <Kicker zh="每個家庭都遇過" en="EVERY FAMILY KNOWS THIS" />
      <div style={{ height: 24 }} />
      <KineticLines seg={seg} voLocal={voLocal} size={54} />
    </AbsoluteFill>
  </AbsoluteFill>
);

export const Main: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#0c1512', fontFamily: FONT }}>
      <Sequence from={0} durationInFrames={300}>
        <Shot dur={300} first><ColdOpen seg={0} voLocal={45} dur={300} /></Shot>
      </Sequence>
      <Sequence from={288} durationInFrames={552}>
        <Shot dur={552}><Problem seg={1} voLocal={42} dur={552} /></Shot>
      </Sequence>
      <Sequence from={828} durationInFrames={672}>
        <Shot dur={672}><Reveal seg={2} voLocal={42} /></Shot>
      </Sequence>
      <Sequence from={1488} durationInFrames={912}>
        <Shot dur={912}><PhoneShot kind="wall" seg={3} voLocal={72} kicker="秘書動態" kickerEn="THE SECRETARY'S FEED" /></Shot>
      </Sequence>
      <Sequence from={2388} durationInFrames={762}>
        <Shot dur={762}><PhoneShot kind="weekly" seg={4} voLocal={72} kicker="本週回顧" kickerEn="THE WEEKLY REVIEW" /></Shot>
      </Sequence>
      <Sequence from={3138} durationInFrames={762}>
        <Shot dur={762}><PhoneShot kind="care" seg={5} voLocal={72} kicker="照顧者" kickerEn="THE CAREGIVER" /></Shot>
      </Sequence>
      <Sequence from={3888} durationInFrames={912}>
        <Shot dur={912}><Pipeline seg={6} voLocal={72} dur={912} /></Shot>
      </Sequence>
      <Sequence from={4788} durationInFrames={612}>
        <Shot dur={612} last><EndCard seg={7} voLocal={72} dur={612} /></Shot>
      </Sequence>
      {VO.map((v, i) => (
        <Sequence key={v.file} from={VO_AT[i]}>
          <Audio src={staticFile(v.file)} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
