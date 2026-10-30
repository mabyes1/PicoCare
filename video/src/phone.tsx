import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import React from 'react';
import { FONT, GREEN, INK, PAPER } from './cards';

const MUTED = '#6c7c70';
const AMBER = '#a46a14';
const RUST = '#a84224';
const SAGE = '#e7efe1';
const SAGE_BORDER = '#ccdcca';
const CARD_BORDER = '#dee6d8';
const PILL_AMBER = '#faf0da';
const PILL_BLUSH = '#fae8e1';
const PILL_MIST = '#ebefe9';

const Pill: React.FC<{ text: string; fg: string; bg: string }> = ({ text, fg, bg }) => (
  <span style={{ display: 'inline-block', fontSize: 17, fontWeight: 700, color: fg, backgroundColor: bg, borderRadius: 14, padding: '6px 14px', marginRight: 8, marginBottom: 6 }}>{text}</span>
);
const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ backgroundColor: 'white', border: `1px solid ${CARD_BORDER}`, borderRadius: 20, padding: '20px 22px', marginBottom: 16 }}>{children}</div>
);
const Title: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 22, fontWeight: 800, color: INK, marginBottom: 6 }}>{children}</div>
);
const Body: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 19, color: '#3e5046', lineHeight: 1.5 }}>{children}</div>
);
const Ev: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 17, color: MUTED, marginTop: 4 }}>• {children}</div>
);
const Meta: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap' }}>{children}</div>
);

// All content below is real product output captured 2026-10-29/30:
// live DB notes/evidence, a real Baseten open-model weekly review of Ken's notes,
// and Ken's real alerts/timeline. Layout mirrors the app pixel language.
export const WALL_TIME = '15 小時前';
export const LATE_TIME = '2026/10/29';
export const WEEKLY_TEXT = 'Ken 本週（2026-10-23～2026-10-30）的近況分享：本週有 2 次報平安紀錄。10/29 這天，早上 08:25 第一次看到手機亮起來，到了 00:00 手機還亮著。想多了解近況的話，找個時間打通電話聊聊、關心一下吧。';

const PhoneFrame: React.FC<{ children: React.ReactNode; scroll: number; scale?: number; shiftY?: number }> = ({ children, scroll, scale = 1, shiftY = 0 }) => (
  <AbsoluteFill style={{ backgroundColor: '#101a15', justifyContent: 'center', alignItems: 'center', fontFamily: FONT }}>
    <div style={{ width: 520, height: 1040, backgroundColor: '#0a0f0c', borderRadius: 56, padding: 16, transform: `translateY(${shiftY}px) scale(${scale})`, boxShadow: '0 36px 100px rgba(0,0,0,0.55)' }}>
      <div style={{ width: '100%', height: '100%', backgroundColor: PAPER, borderRadius: 42, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '18px 28px 10px', fontSize: 19, color: INK, fontWeight: 700, backgroundColor: PAPER, zIndex: 2, borderBottom: '1px solid rgba(34,51,43,0.06)' }}>
          <span>00:05</span><span>5G ▮▮▮ 68</span>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <div style={{ transform: `translateY(${scroll}px)`, padding: '14px 22px 40px' }}>{children}</div>
        </div>
      </div>
    </div>
  </AbsoluteFill>
);

const Head: React.FC<{ kicker: string; title: string; sub: string }> = ({ kicker, title, sub }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 17, fontWeight: 800, color: GREEN, marginBottom: 2 }}>{kicker}</div>
    <div style={{ fontSize: 36, fontWeight: 900, color: INK, lineHeight: 1.2 }}>{title}</div>
    {sub ? <div style={{ fontSize: 18, color: MUTED, marginTop: 4 }}>{sub}</div> : null}
  </div>
);

export const WallScreen: React.FC<{ scale?: number; shiftY?: number }> = ({ scale, shiftY }) => {
  const frame = useCurrentFrame();
  const scroll = interpolate(frame, [30, 570], [0, -220], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <PhoneFrame scroll={scroll} scale={scale} shiftY={shiftY}>
      <Head kicker="PicoCare" title="秘書的想法" sub="秘書看到了什麼、怎麼理解你。" />
      <Card><div style={{ fontSize: 21, fontWeight: 800, color: INK, marginBottom: 8 }}>PicoCare 的關懷思考</div>
        <Title>手機螢幕開啟</Title><Body>維持原本關心流程，等待可用證據。</Body>
        <Meta><Pill text="剛剛的想法" fg={MUTED} bg={PILL_MIST} /></Meta></Card>
      <div style={{ fontSize: 22, fontWeight: 800, color: INK, margin: '14px 0 10px' }}>秘書動態</div>
      <Card><Title>今天第一次看到你用手機</Title><Body>今天 08:25 第一次看到手機亮起來。</Body>
        <Ev>今天第一次手機可互動</Ev>
        <Meta><Pill text={WALL_TIME} fg={MUTED} bg={PILL_MIST} /><Pill text="本地整理" fg={GREEN} bg={SAGE} /></Meta></Card>
      <Card><Title>這麼晚了手機還亮著</Title><Body>已經 00:00 了，手機還亮著。</Body>
        <Ev>深夜手機仍可互動（00:00）</Ev>
        <Meta><Pill text={LATE_TIME} fg={MUTED} bg={PILL_MIST} /><Pill text="本地整理" fg={GREEN} bg={SAGE} /></Meta></Card>
    </PhoneFrame>
  );
};

export const WeeklyScreen: React.FC<{ scale?: number; shiftY?: number }> = ({ scale, shiftY }) => {
  const frame = useCurrentFrame();
  const scroll = interpolate(frame, [60, 540], [0, -40], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <PhoneFrame scroll={scroll} scale={scale} shiftY={shiftY}>
      <Head kicker="PicoCare" title="秘書的想法" sub="秘書看到了什麼、怎麼理解你。" />
      <Card><div style={{ fontSize: 21, fontWeight: 800, color: INK, marginBottom: 8 }}>本週回顧</div>
        <Body>{WEEKLY_TEXT}</Body>
        <Meta><Pill text="開源模型整理" fg={GREEN} bg={SAGE} /><Pill text="剛剛" fg={MUTED} bg={PILL_MIST} /></Meta></Card>
      <Card><Title>今天第一次看到你用手機</Title><Body>今天 08:25 第一次看到手機亮起來。</Body>
        <Meta><Pill text={WALL_TIME} fg={MUTED} bg={PILL_MIST} /><Pill text="本地整理" fg={GREEN} bg={SAGE} /></Meta></Card>
    </PhoneFrame>
  );
};

export const CareScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const phase = interpolate(frame, [160, 190], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const scroll = interpolate(frame, [30, 150], [0, -60], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const scroll2 = interpolate(frame, [220, 700], [0, -440], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <PhoneFrame scroll={0}>
      <div style={{ position: 'relative', minHeight: 940 }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, opacity: 1 - phase, pointerEvents: 'none' }}>
          <div style={{ transform: `translateY(${scroll}px)` }}>
            <Head kicker="我的照顧空間" title="關心的人" sub="" />
            <Card><div style={{ fontSize: 21, fontWeight: 800, color: INK, marginBottom: 8 }}>需要處理（2）</div>
              <div style={{ fontSize: 18, color: RUST, fontWeight: 700, backgroundColor: '#f7f9f4', border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: '10px 14px' }}>本人求助 · Ken 10-29 21:25</div>
              <div style={{ fontSize: 18, color: RUST, fontWeight: 700, backgroundColor: '#f7f9f4', border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: '10px 14px', marginTop: 8 }}>本人求助 · Ken 10-27 18:53</div></Card>
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: SAGE, border: `1px solid ${SAGE_BORDER}`, color: GREEN, fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>K</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: INK }}>Ken</div>
              </div>
              <Meta><Pill text="等候報安" fg={AMBER} bg={PILL_AMBER} /><Pill text="連線正常" fg={GREEN} bg={SAGE} /><Pill text="已求助" fg={RUST} bg={PILL_BLUSH} /></Meta>
              <div style={{ marginTop: 10, backgroundColor: SAGE, border: `1px solid ${SAGE_BORDER}`, borderRadius: 14, padding: '11px 0', textAlign: 'center', fontSize: 19, color: GREEN, fontWeight: 700 }}>查看</div>
            </Card>
          </div>
        </div>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, opacity: phase, pointerEvents: 'none' }}>
          <div style={{ transform: `translateY(${scroll2}px)` }}>
            <Head kicker="Ken" title="近況" sub="" />
            <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap' }}><Pill text="等候報安" fg={AMBER} bg={PILL_AMBER} /><Pill text="連線正常" fg={GREEN} bg={SAGE} /><Pill text="已求助" fg={RUST} bg={PILL_BLUSH} /></div>
            <Card><div style={{ fontSize: 21, fontWeight: 800, color: INK, marginBottom: 8 }}>本週回顧</div>
              <Body>{WEEKLY_TEXT}</Body>
              <Meta><Pill text="開源模型整理" fg={GREEN} bg={SAGE} /><Pill text="剛剛" fg={MUTED} bg={PILL_MIST} /></Meta></Card>
            <Card><div style={{ fontSize: 21, fontWeight: 800, color: INK, marginBottom: 8 }}>近況時間線</div>
              {['00:07', '00:07', '00:06', '00:06', '00:05', '00:05', '00:04', '00:04'].map((t, i) => (
                <div key={i} style={{ fontSize: 18, color: INK, marginTop: 6 }}>手機動態 · {t}</div>
              ))}</Card>
            <Card><div style={{ fontSize: 21, fontWeight: 800, color: INK, marginBottom: 8 }}>提醒</div>
              <div style={{ fontSize: 18, color: RUST, fontWeight: 700 }}>本人求助 10-29 21:25</div>
              <div style={{ fontSize: 18, color: RUST, fontWeight: 700, marginTop: 6 }}>本人求助 10-27 18:53</div>
              <div style={{ marginTop: 10, backgroundColor: '#f7f9f4', border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: '10px 0', textAlign: 'center', fontSize: 18, color: INK, fontWeight: 700 }}>標記已讀</div></Card>
            <div style={{ backgroundColor: GREEN, borderRadius: 14, padding: '14px 0', textAlign: 'center', fontSize: 20, color: 'white', fontWeight: 800 }}>求助已處理</div>
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
};
