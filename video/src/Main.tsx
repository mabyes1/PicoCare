import { AbsoluteFill, Sequence } from 'remotion';
import React from 'react';
import { BulletCard, CaptionBar, FootageSlot, TitleCard } from './cards';

// 3-minute submission video, 1920x1080 @30fps = 5400 frames.
// FootageSlot entries are swapped for real device recordings before render.
export const Main: React.FC = () => {
  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={240}>
        <TitleCard title="PicoCare" sub="手機默默看 · 秘書動腦想 · 家人放心忙" en="The phone watches quietly · The secretary thinks · The family rests easy" />
      </Sequence>
      <Sequence from={240} durationInFrames={660}>
        <BulletCard head="家人擔心，但不想打擾" enHead="Families worry, but don't want to intrude" lines={['獨居長輩一天沒消息，家人只能乾著急', '監控 App 侵犯隱私，定時問候又像查勤', 'PicoCare：只看手機線索，有發現才開口']} />
      </Sequence>
      <Sequence from={900} durationInFrames={600}>
        <FootageSlot label="實機畫面 1：秘書動態牆" hint="phone-wall.mp4 · 判讀頁動態流" />
      </Sequence>
      <Sequence from={900} durationInFrames={600}>
        <CaptionBar text="秘書每天把發現寫成動態，每則都掛著證據" en="The secretary posts daily findings, each citing its evidence" />
      </Sequence>
      <Sequence from={1500} durationInFrames={600}>
        <FootageSlot label="實機畫面 2：本週回顧" hint="phone-weekly.mp4 · Meta 寫給家人的話" />
      </Sequence>
      <Sequence from={1500} durationInFrames={600}>
        <CaptionBar text="Meta 讀一週動態，寫成家人看得懂的一段話" en="Meta reads the week's feed and writes one paragraph for family" />
      </Sequence>
      <Sequence from={2100} durationInFrames={600}>
        <FootageSlot label="實機畫面 3：提問閉環" hint="phone-ask.mp4 · 問一題 → 本人回 → 交接" />
      </Sequence>
      <Sequence from={2100} durationInFrames={600}>
        <CaptionBar text="值得關心先問本人，未釐清才交給家人" en="Ask the parent first; hand to family only if unclear" />
      </Sequence>
      <Sequence from={2700} durationInFrames={1200}>
        <BulletCard head="怎麼做到不亂猜" enHead="How it avoids guessing wildly" lines={['手機本地採集：前景、播放、通知、定位、電量', '本地規則先守門：證據不夠就閉嘴', 'Meta 融合多條弱訊號，寫成一句關心', '只針對事實發揮，絕不捏造時間跟數字']} />
      </Sequence>
      <Sequence from={3900} durationInFrames={900}>
        <BulletCard head="為什麼非 Meta 不可" enHead="Why only Meta can do this" lines={['本週回顧：讀一週證據寫人話，規則寫不出來', 'ELSE 補充：長輩自由回答，Meta 判讀要不要找家人', '拔掉 Meta，秘書就變回只會問候的鬧鐘']} />
      </Sequence>
      <Sequence from={4800} durationInFrames={600}>
        <TitleCard title="不碰醫療，只做關懷" sub="PicoCare · Meta Global AI Developer Hackathon" en="No medical advice. Only care." />
      </Sequence>
    </AbsoluteFill>
  );
};
