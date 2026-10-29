import { AbsoluteFill, Sequence } from 'remotion';
import React from 'react';
import { CaptionBar, TitleCard } from './cards';
import { WallScreen, WeeklyScreen } from './phone';

// Vertical X cut, 1080x1920 @30fps, 40s = 1200 frames. Before/after contrast.
export const Vertical: React.FC = () => {
  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={180}>
        <TitleCard title="等了一天，只等到這句" sub="「維持原本關心流程，等待可用證據」" en={'All day of waiting, for this: "waiting for evidence"'} />
      </Sequence>
      <Sequence from={180} durationInFrames={420}>
        <WallScreen scale={1.45} shiftY={-60} />
      </Sequence>
      <Sequence from={180} durationInFrames={420}>
        <CaptionBar text="現在，秘書每天都有話說" en="Now the secretary speaks every day" />
      </Sequence>
      <Sequence from={600} durationInFrames={360}>
        <WeeklyScreen scale={1.45} shiftY={-60} />
      </Sequence>
      <Sequence from={600} durationInFrames={360}>
        <CaptionBar text="Meta 每週寫一段給家人" en="Meta writes a weekly note for family" />
      </Sequence>
      <Sequence from={960} durationInFrames={240}>
        <TitleCard title="PicoCare" sub="手機默默看 · 秘書動腦想 · 家人放心忙" en="The phone watches quietly · The secretary thinks · The family rests easy" />
      </Sequence>
    </AbsoluteFill>
  );
};
