import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';

export const FONT = "'Segoe UI','Inter','Helvetica Neue','PingFang TC','Noto Sans TC','Microsoft JhengHei',sans-serif";
export const GREEN = '#205c4a';
export const PAPER = '#f5f7f0';
export const INK = '#31442f';

export const TitleCard: React.FC<{ title: string; sub?: string; en?: string }> = ({ title, sub, en }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const up = spring({ frame, fps, config: { damping: 200, stiffness: 120 } });
  const dy = interpolate(up, [0, 1], [30, 0]);
  return (
    <AbsoluteFill style={{ backgroundColor: GREEN, justifyContent: 'center', alignItems: 'center', opacity, fontFamily: FONT }}>
      <div style={{ transform: `translateY(${dy}px)`, textAlign: 'center', padding: 60 }}>
        <div style={{ fontSize: 84, fontWeight: 900, color: 'white', lineHeight: 1.25 }}>{title}</div>
        {sub ? <div style={{ fontSize: 40, color: '#cfe0d4', marginTop: 24 }}>{sub}</div> : null}
        {en ? <div style={{ fontSize: 28, color: '#9db8a8', marginTop: 12 }}>{en}</div> : null}
      </div>
    </AbsoluteFill>
  );
};

export const CaptionBar: React.FC<{ text: string; en: string }> = ({ text, en }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', fontFamily: FONT, pointerEvents: 'none' }}>
      <div style={{ opacity, backgroundColor: 'rgba(0,0,0,0.72)', color: 'white', fontSize: 38, padding: '16px 36px', borderRadius: 16, marginBottom: 48, maxWidth: '86%', textAlign: 'center' }}>
        <div>{text}</div>
        <div style={{ fontSize: 26, color: '#cfe0d4', marginTop: 8 }}>{en}</div>
      </div>
    </AbsoluteFill>
  );
};

// Placeholder for a real device-footage slot. Swapped for <Video> once filmed.
export const FootageSlot: React.FC<{ label: string; hint: string }> = ({ label, hint }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#101a15', justifyContent: 'center', alignItems: 'center', fontFamily: FONT }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 64, fontWeight: 800, color: GREEN, backgroundColor: PAPER, borderRadius: 24, padding: '20px 48px' }}>{label}</div>
        <div style={{ fontSize: 32, color: '#8aa393', marginTop: 24 }}>{hint}</div>
      </div>
    </AbsoluteFill>
  );
};

export const BulletCard: React.FC<{ head: string; enHead: string; lines: string[] }> = ({ head, enHead, lines }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: PAPER, fontFamily: FONT, padding: 90, justifyContent: 'center' }}>
      <div style={{ fontSize: 56, fontWeight: 900, color: GREEN }}>{head}</div>
      <div style={{ fontSize: 30, color: '#6b8577', marginBottom: 36, marginTop: 8 }}>{enHead}</div>
      {lines.map((l, i) => {
        const o = interpolate(frame - 15 - i * 20, [0, 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return <div key={i} style={{ opacity: o, fontSize: 40, color: INK, marginTop: 18 }}>✓ {l}</div>;
      })}
    </AbsoluteFill>
  );
};

export const DemoSequence: React.FC<{ from: number; dur: number; children: React.ReactNode }> = ({ from, dur, children }) => (
  <Sequence from={from} durationInFrames={dur}>{children}</Sequence>
);
