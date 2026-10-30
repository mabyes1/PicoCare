import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';
import { FONT, GREEN, PAPER } from './cards';
import { VO } from './captions';
import { STILLS } from './footage';

const EASE = Easing.bezier(0.22, 1, 0.36, 1);
const rise = (frame: number, at: number, len = 14, dist = 24) =>
  interpolate(frame, [at, at + len], [dist, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
const fade = (frame: number, at: number, len = 12) =>
  interpolate(frame, [at, at + len], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

export const Shot: React.FC<{ dur: number; first?: boolean; last?: boolean; children: React.ReactNode }> = ({ dur, first, last, children }) => {
  const frame = useCurrentFrame();
  const fadeIn = first ? 1 : fade(frame, 0, 12);
  const fadeOut = last ? 1 : interpolate(frame, [dur - 12, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut) }}>{children}</AbsoluteFill>;
};

export const KenBurns: React.FC<{ src: string; dur: number; dim?: number; fromScale?: number; toScale?: number }> = ({
  src,
  dur,
  dim = 0.45,
  fromScale = 1.0,
  toScale = 1.08,
}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, dur], [fromScale, toScale], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const y = interpolate(frame, [0, dur], [0, -16], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill>
      <Img src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale}) translateY(${y}px)` }} />
      <AbsoluteFill style={{ backgroundColor: `rgba(8,14,11,${dim})` }} />
    </AbsoluteFill>
  );
};

export const KineticLines: React.FC<{
  seg: number;
  voLocal: number;
  size?: number;
  align?: 'left' | 'center';
  tone?: 'dark' | 'light';
  only?: number[];
}> = ({ seg, voLocal, size = 56, align = 'left', tone = 'dark', only }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cues = VO[seg].cues.map((c, i) => ({ ...c, i })).filter((c) => !only || only.includes(c.i));
  const active = cues.reduce((acc, c, i) => (frame >= voLocal + c.start * fps - 4 ? i : acc), -1);
  const ink = tone === 'dark' ? 'white' : '#102019';
  const sub = tone === 'dark' ? '#cfe0d4' : '#1c5846';
  return (
    <div style={{ fontFamily: FONT, textAlign: align, width: align === 'center' ? '100%' : 1140 }}>
      {cues.map((c, i) => {
        const at = voLocal + c.start * fps - 4;
        const o = i <= active ? fade(frame, at) : 0;
        if (o <= 0) return <div key={i} style={{ height: 0 }} />;
        return (
          <div key={i} style={{ opacity: o * (i === active ? 1 : 0.62), transform: `translateY(${rise(frame, at)}px)`, marginTop: i === 0 ? 0 : 22 }}>
            <div style={{ fontSize: size, fontWeight: 900, color: ink, lineHeight: 1.28, textShadow: tone === 'dark' ? '0 4px 28px rgba(0,0,0,0.55)' : 'none' }}>
              {c.zh}
            </div>
            {c.en ? <div style={{ fontSize: Math.round(size * 0.42), color: sub, marginTop: 8 }}>{c.en}</div> : null}
          </div>
        );
      })}
    </div>
  );
};

export const CaptionBottom: React.FC<{ seg: number; voLocal: number }> = ({ seg, voLocal }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const cues = VO[seg].cues;
  const active = cues.reduce((acc, c, i) => (frame >= voLocal + c.start * fps - 4 ? i : acc), 0);
  const c = cues[Math.max(0, active)];
  const at = voLocal + c.start * fps - 4;
  const o = fade(frame, at, 8);
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', fontFamily: FONT, pointerEvents: 'none' }}>
      <div
        style={{
          opacity: o,
          transform: `translateY(${rise(frame, at, 10, 12)}px)`,
          backgroundColor: 'rgba(8,16,12,0.88)',
          borderRadius: 16,
          padding: width > 1400 ? '13px 32px' : '18px 34px',
          marginBottom: width > 1400 ? 28 : 96,
          maxWidth: width > 1400 ? '82%' : '90%',
          textAlign: 'center',
          border: '1px solid rgba(207,224,212,0.24)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.45)',
        }}
      >
        <div style={{ color: 'white', fontSize: width > 1400 ? 29 : 36, fontWeight: 700, lineHeight: 1.35 }}>{c.zh}</div>
      </div>
    </AbsoluteFill>
  );
};

export const Kicker: React.FC<{ zh: string; en?: string; at?: number; light?: boolean }> = ({ zh, en, at = 8, light = false }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ opacity: fade(frame, at), transform: `translateY(${rise(frame, at)}px)`, fontFamily: FONT }}>
      <div
        style={{
          display: 'inline-block',
          fontSize: 16.5,
          fontWeight: 800,
          letterSpacing: 3,
          color: light ? '#1c5846' : '#0c1512',
          backgroundColor: light ? '#e7efe1' : PAPER,
          border: light ? '1px solid #ccdcca' : 'none',
          borderRadius: 999,
          padding: '7px 18px',
        }}
      >
        {zh}
      </div>
      {en ? <div style={{ fontSize: 18, color: '#9db8a8', marginTop: 8, letterSpacing: 1.5 }}>{en}</div> : null}
    </div>
  );
};

// True 1080:2340 aspect-ratio phone frame (no horizontal cropping of screenshot edges)
export const FocusedPhone: React.FC<{
  src: string;
  secondSrc?: string;
  switchAt?: number;
  zoomFrom?: number;
  zoomTo?: number;
  panYFrom?: number;
  panYTo?: number;
  dur: number;
  width?: number;
  height?: number;
}> = ({
  src,
  secondSrc,
  switchAt = 120,
  zoomFrom = 0.98,
  zoomTo = 1.03,
  panYFrom = 6,
  panYTo = -6,
  dur,
  width = 432,
  height = 918,
}) => {
  const frame = useCurrentFrame();
  const deviceScale = interpolate(frame, [0, dur], [zoomFrom, zoomTo], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
  const deviceY = interpolate(frame, [0, dur], [panYFrom, panYTo], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
  const secondOpacity = secondSrc
    ? interpolate(frame, [switchAt - 12, switchAt + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 0;
  return (
    <div
      style={{
        width,
        height,
        backgroundColor: '#0b120e',
        borderRadius: 46,
        padding: 12,
        transform: `translateY(${deviceY}px) scale(${deviceScale})`,
        boxShadow: '0 34px 90px rgba(0,0,0,0.62), 0 0 0 1.5px rgba(207,224,212,0.24)',
        position: 'relative',
      }}
    >
      <div style={{ width: '100%', height: '100%', backgroundColor: '#f4f6f0', borderRadius: 35, overflow: 'hidden', position: 'relative' }}>
        <Img
          src={staticFile(src)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'fill',
          }}
        />
        {secondSrc ? (
          <Img
            src={staticFile(secondSrc)}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'fill',
              opacity: secondOpacity,
            }}
          />
        ) : null}
      </div>
    </div>
  );
};

// ACT 1: Cold Open + The Dilemma (art-worry -> art-hero with animated contrast cards)
export const ColdOpenProblem: React.FC<{ seg: number; voLocal: number; dur: number }> = ({ seg, voLocal, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const secondCueAt = voLocal + Math.round(VO[seg].cues[1].start * fps);
  const splitMix = interpolate(frame, [secondCueAt - 12, secondCueAt + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ fontFamily: FONT, backgroundColor: '#08100c' }}>
      <AbsoluteFill style={{ opacity: 1 - splitMix * 0.65 }}>
        <KenBurns src="art-worry.jpg" dur={dur} dim={0.38} fromScale={1.0} toScale={1.09} />
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: splitMix }}>
        <KenBurns src="art-hero.jpg" dur={dur} dim={0.52} fromScale={1.02} toScale={1.1} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(6,12,9,0.92) 0%, rgba(6,12,9,0.68) 55%, rgba(6,12,9,0.35) 100%)' }} />

      <AbsoluteFill style={{ padding: '72px 104px', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Kicker zh="THE QUIET WORRY" />
          <div style={{ color: '#9db8a8', fontSize: 19, fontWeight: 700, letterSpacing: 2 }}>PICOCARE · ELDER CARE SECRETARY</div>
        </div>

        <div style={{ maxWidth: 1120 }}>
          <div
            style={{
              opacity: fade(frame, voLocal - 4),
              transform: `translateY(${rise(frame, voLocal - 4)}px)`,
              fontSize: 58,
              fontWeight: 900,
              color: 'white',
              lineHeight: 1.22,
              textShadow: '0 6px 32px rgba(0,0,0,0.55)',
            }}
          >
            "When an aging parent lives alone,
            <br />
            <span style={{ color: '#cfe0d4' }}>a whole day of silence</span> makes your heart race."
          </div>

          <div style={{ display: 'flex', gap: 24, marginTop: 38 }}>
            {[
              {
                at: secondCueAt - 4,
                badge: '✕  INTRUSIVE SURVEILLANCE',
                title: 'Cameras invade privacy',
                desc: "Turning a parent's living room into a live feed strips away dignity at home.",
              },
              {
                at: secondCueAt + 34,
                badge: '✕  DAILY ROLL CALLS',
                title: 'Rigid check-in alarms nag',
                desc: 'Fixed timers interrupt them mid-movie or nap, feeling like a daily inspection.',
              },
            ].map((card, i) => {
              const o = fade(frame, card.at, 14);
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    opacity: o,
                    transform: `translateY(${rise(frame, card.at, 16)}px)`,
                    backgroundColor: 'rgba(16, 28, 22, 0.86)',
                    border: '1.5px solid rgba(236, 174, 152, 0.4)',
                    borderRadius: 22,
                    padding: '24px 28px',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#f29b7e', letterSpacing: 2 }}>{card.badge}</div>
                  <div style={{ fontSize: 29, fontWeight: 800, color: 'white', marginTop: 8 }}>{card.title}</div>
                  <div style={{ fontSize: 19.5, color: '#bfd0c5', marginTop: 8, lineHeight: 1.4 }}>{card.desc}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ height: 50 }} />
      </AbsoluteFill>
      <CaptionBottom seg={seg} voLocal={voLocal} />
    </AbsoluteFill>
  );
};

// ACT 2: Reveal + 3 Architectural Pillars on warm paper
export const Reveal: React.FC<{ seg: number; voLocal: number }> = ({ seg, voLocal }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const word = 'PicoCare';
  const cues = VO[seg].cues;

  const pillars = [
    {
      num: '01 · ON-DEVICE SENSES',
      title: 'The phone watches quietly',
      sub: 'Foreground app, media playback, motion, location & battery — sampled locally with a 7-day timeline.',
      at: voLocal + Math.round((cues[1]?.start ?? 4.6) * fps) - 4,
    },
    {
      num: '02 · META MUSE SPARK',
      title: 'The secretary thinks',
      sub: 'Fuses weak routine signals into a caring question and triages free-text replies with guardrails.',
      at: voLocal + Math.round((cues[2]?.start ?? 7.2) * fps) - 4,
    },
    {
      num: '03 · SHARED CARE',
      title: 'The family rests easy',
      sub: 'Daily evidence feed + open-weight weekly review. Escalates only when a concern stays unclarified.',
      at: voLocal + Math.round((cues[3]?.start ?? 9.8) * fps) - 4,
    },
  ];

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <Img src={staticFile('art-paper.jpg')} style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover' }} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(244,246,240,0.4) 0%, rgba(16,36,28,0.88) 100%)' }} />

      <AbsoluteFill style={{ padding: '64px 100px 108px', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <div
            style={{
              opacity: fade(frame, voLocal - 14),
              display: 'inline-block',
              fontSize: 18,
              color: '#1c5846',
              backgroundColor: '#e7efe1',
              border: '1px solid #bed3b4',
              borderRadius: 999,
              padding: '8px 24px',
              fontWeight: 800,
              letterSpacing: 3,
              marginBottom: 14,
            }}
          >
            PERSONAL ELDER CARE SECRETARY
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            {word.split('').map((ch, i) => {
              const at = voLocal - 16 + i * 2;
              return (
                <div
                  key={i}
                  style={{
                    opacity: fade(frame, at),
                    transform: `translateY(${rise(frame, at, 14)}px)`,
                    fontSize: 118,
                    fontWeight: 900,
                    color: '#0e1f18',
                    lineHeight: 1.05,
                  }}
                >
                  {ch}
                </div>
              );
            })}
          </div>
          <div style={{ opacity: fade(frame, voLocal + 4), fontSize: 26, color: '#244235', fontWeight: 700, marginTop: 10 }}>
            Care coordination grounded in observable phone evidence — never healthcare diagnosis.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 26, width: '100%' }}>
          {pillars.map((p, i) => {
            const active = frame >= p.at;
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  opacity: active ? fade(frame, p.at, 12) : 0.72,
                  transform: `translateY(${active ? rise(frame, p.at, 14, 16) : 10}px)`,
                  backgroundColor: active ? '#ffffff' : 'rgba(255,255,255,0.82)',
                  border: `2px solid ${active ? '#1c5846' : 'rgba(28,88,70,0.28)'}`,
                  borderRadius: 24,
                  padding: '26px 28px',
                  boxShadow: active ? '0 24px 60px rgba(12,28,20,0.28)' : '0 8px 24px rgba(12,28,20,0.12)',
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 800, color: '#1c5846', letterSpacing: 2 }}>{p.num}</div>
                <div style={{ fontSize: 30, fontWeight: 900, color: '#13261d', marginTop: 10, lineHeight: 1.2 }}>{p.title}</div>
                <div style={{ fontSize: 19, color: '#3e5046', marginTop: 10, lineHeight: 1.45 }}>{p.sub}</div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      <CaptionBottom seg={seg} voLocal={voLocal} />
    </AbsoluteFill>
  );
};

// ACT 3: Elder Home Tab (phone-home.png + 3 live synchronized feature cards)
export const ElderHomeShot: React.FC<{ seg: number; voLocal: number; dur: number }> = ({ seg, voLocal, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cues = VO[seg].cues;

  const cards = [
    {
      at: voLocal + Math.round((cues[0]?.start ?? 0.05) * fps) - 4,
      tag: 'DESIGNED FOR SENIORS',
      title: 'Zero-Friction Interface — No Chatbots',
      desc: 'Three clean bottom tabs (Home · Insights · Settings). Elders never have to type prompts or navigate complex settings.',
      pill: 'Bilingual: English / 繁體中文',
    },
    {
      at: voLocal + Math.round((cues[1]?.start ?? 4.5) * fps) - 4,
      tag: 'ONE-TAP ACTIONS',
      title: '"I\'m OK" Check-In & Immediate Help',
      desc: 'Explicit help requests notify caregivers right away. Offline events queue safely in an encrypted local outbox.',
      pill: 'AndroidKeyStore + SQLite Outbox',
    },
    {
      at: voLocal + Math.round((cues[2]?.start ?? 7.5) * fps) - 4,
      tag: 'AUTONOMY FIRST',
      title: 'Asks the Person Before Alerting Family',
      desc: 'When the secretary spots a change, it asks one clear multiple-choice question with a per-question ELSE box.',
      pill: 'Respects privacy & independence',
    },
  ];

  const activeIdx = cards.reduce((acc, c, i) => (frame >= c.at ? i : acc), 0);

  return (
    <AbsoluteFill style={{ backgroundColor: '#0c1612', fontFamily: FONT }}>
      <AbsoluteFill style={{ background: 'radial-gradient(circle at 25% 50%, rgba(28,88,70,0.34), transparent 60%)' }} />

      <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', padding: '38px 96px 88px', gap: 72 }}>
        <div style={{ flexShrink: 0 }}>
          <FocusedPhone src={STILLS.home[0]} dur={dur} width={432} height={918} />
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Kicker zh="ELDER APP · tw.picocare.meta" />
          <div style={{ fontSize: 46, fontWeight: 900, color: 'white', lineHeight: 1.18 }}>
            Built Around the Elder's Dignity
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 4 }}>
            {cards.map((c, i) => {
              const isCurrent = i === activeIdx;
              const isPast = i < activeIdx;
              return (
                <div
                  key={i}
                  style={{
                    opacity: isCurrent ? 1 : isPast ? 0.85 : 0.55,
                    transform: `translateX(${isCurrent ? 0 : 8}px)`,
                    backgroundColor: isCurrent ? '#ffffff' : isPast ? 'rgba(28, 88, 70, 0.34)' : 'rgba(255, 255, 255, 0.08)',
                    border: `2px solid ${isCurrent ? '#7bc4a4' : 'rgba(207,224,212,0.22)'}`,
                    borderRadius: 20,
                    padding: '20px 26px',
                    boxShadow: isCurrent ? '0 20px 50px rgba(0,0,0,0.4)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: isCurrent ? '#1c5846' : '#8fd4b5', letterSpacing: 2 }}>{c.tag}</span>
                    <span
                      style={{
                        fontSize: 13.5,
                        fontWeight: 700,
                        color: isCurrent ? '#1c5846' : '#0c1612',
                        backgroundColor: isCurrent ? '#e7efe1' : '#cfe8da',
                        borderRadius: 999,
                        padding: '4px 14px',
                      }}
                    >
                      {c.pill}
                    </span>
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: isCurrent ? '#13261d' : 'white', marginTop: 6 }}>{c.title}</div>
                  <div style={{ fontSize: 18, color: isCurrent ? '#3e5046' : '#c4d6cb', marginTop: 6, lineHeight: 1.4 }}>{c.desc}</div>
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>
      <CaptionBottom seg={seg} voLocal={voLocal} />
    </AbsoluteFill>
  );
};

// ACT 4: The Living Feed (phone-insight.png -> phone-wall.png + real timestamp evidence cards)
export const WallFeedShot: React.FC<{ seg: number; voLocal: number; dur: number }> = ({ seg, voLocal, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cues = VO[seg].cues;
  const switchFrame = voLocal + Math.round((cues[1]?.start ?? 4.8) * fps);

  const feedCards = [
    {
      at: voLocal + Math.round((cues[0]?.start ?? 0.05) * fps) - 4,
      time: 'LIVE FEED · MAX 6 / DAY',
      title: 'Proactive Daily Observations',
      evidence: 'Speaks up when everyday life happens — no need to wait for an emergency.',
      badge: 'Real-time local + Meta fusion',
      tone: '#8fd4b5',
    },
    {
      at: voLocal + Math.round((cues[1]?.start ?? 4.8) * fps) - 4,
      time: '08:25 AM · MORNING ROUTINE',
      title: '"First time on the phone today"',
      evidence: '• First phone interaction today — First saw the phone light up today at 08:25.',
      badge: 'On-device · 10/29/26',
      tone: '#f5d076',
    },
    {
      at: voLocal + Math.round((cues[2]?.start ?? 8.9) * fps) - 4,
      time: '00:00 AM · LATE NIGHT',
      title: '"Phone still on this late"',
      evidence: "• Phone still interactive late at night (00:00) — It's already 00:00, and the phone is still on.",
      badge: 'On-device · 16 hr ago',
      tone: '#f29b7e',
    },
    {
      at: voLocal + Math.round((cues[3]?.start ?? 11.6) * fps) - 4,
      time: 'ZERO HALLUCINATIONS',
      title: 'Every Post Cites Its Raw Evidence ID',
      evidence: 'Outputs without valid event IDs or with medical claims are automatically rejected.',
      badge: 'Verified Provenance',
      tone: '#8fd4b5',
    },
  ];

  const activeIdx = feedCards.reduce((acc, c, i) => (frame >= c.at ? i : acc), 0);

  return (
    <AbsoluteFill style={{ backgroundColor: '#0c1612', fontFamily: FONT }}>
      <AbsoluteFill style={{ background: 'radial-gradient(circle at 24% 55%, rgba(36,108,85,0.34), transparent 62%)' }} />

      <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', padding: '38px 96px 88px', gap: 72 }}>
        <div style={{ flexShrink: 0 }}>
          <FocusedPhone
            src={STILLS.wall[0]}
            secondSrc={STILLS.wall[1]}
            switchAt={switchFrame}
            dur={dur}
            width={432}
            height={918}
          />
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 15 }}>
          <Kicker zh="THE SECRETARY'S FEED · REAL FIELD DATA" />
          <div style={{ fontSize: 44, fontWeight: 900, color: 'white', lineHeight: 1.18 }}>
            Every Finding Carries Its Evidence
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 13, marginTop: 2 }}>
            {feedCards.map((c, i) => {
              const isCurrent = i === activeIdx;
              const isPast = i < activeIdx;
              return (
                <div
                  key={i}
                  style={{
                    opacity: isCurrent ? 1 : isPast ? 0.85 : 0.55,
                    transform: `translateX(${isCurrent ? 0 : 8}px)`,
                    backgroundColor: isCurrent ? '#ffffff' : isPast ? 'rgba(28, 88, 70, 0.34)' : 'rgba(255,255,255,0.08)',
                    border: `2px solid ${isCurrent ? '#7bc4a4' : 'rgba(207,224,212,0.22)'}`,
                    borderRadius: 18,
                    padding: '15px 22px',
                    boxShadow: isCurrent ? '0 18px 46px rgba(0,0,0,0.4)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: isCurrent ? '#1c5846' : c.tone, letterSpacing: 1.8 }}>{c.time}</span>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: isCurrent ? '#1c5846' : '#cfe0d4',
                        backgroundColor: isCurrent ? '#e7efe1' : 'rgba(255,255,255,0.12)',
                        borderRadius: 999,
                        padding: '3px 12px',
                      }}
                    >
                      {c.badge}
                    </span>
                  </div>
                  <div style={{ fontSize: 23, fontWeight: 800, color: isCurrent ? '#14261d' : 'white', marginTop: 4 }}>{c.title}</div>
                  <div style={{ fontSize: 16.5, color: isCurrent ? '#3e5046' : '#c4d6cb', marginTop: 4 }}>{c.evidence}</div>
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>
      <CaptionBottom seg={seg} voLocal={voLocal} />
    </AbsoluteFill>
  );
};

// ACT 5: The Weekly Review (phone-insight.png + Baseten Open-Weight Spotlight)
export const WeeklyReviewShot: React.FC<{ seg: number; voLocal: number; dur: number }> = ({ seg, voLocal, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const secondCueAt = voLocal + Math.round((VO[seg].cues[1]?.start ?? 6.8) * fps);
  const badgeGlow = frame >= secondCueAt - 6;

  return (
    <AbsoluteFill style={{ backgroundColor: '#0c1612', fontFamily: FONT }}>
      <AbsoluteFill style={{ background: 'radial-gradient(circle at 70% 45%, rgba(28,88,70,0.36), transparent 62%)' }} />

      <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', padding: '38px 96px 88px', gap: 72 }}>
        <div style={{ flexShrink: 0 }}>
          <FocusedPhone src={STILLS.weekly[0]} dur={dur} width={432} height={918} />
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Kicker zh="THE WEEKLY REVIEW · META OPEN WEIGHTS" />
          <div style={{ fontSize: 44, fontWeight: 900, color: 'white', lineHeight: 1.18 }}>
            Seven Days of Clues, One Warm Note for Family
          </div>

          <div
            style={{
              opacity: fade(frame, voLocal),
              transform: `translateY(${rise(frame, voLocal, 16)}px)`,
              backgroundColor: '#ffffff',
              borderRadius: 24,
              padding: '28px 32px',
              border: '2px solid #dee6d8',
              boxShadow: '0 28px 70px rgba(0,0,0,0.45)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 23, fontWeight: 900, color: '#14261d' }}>This week · Ken's Live Summary</span>
              <span style={{ fontSize: 15.5, fontWeight: 700, color: '#6c7c70' }}>2026-10-23 → 2026-10-30</span>
            </div>

            <div style={{ fontSize: 22.5, color: '#22332b', lineHeight: 1.55, fontWeight: 600 }}>
              "Hi family, here's Ken's week for 2026-10-23 to 2026-10-30. He checked in{' '}
              <span style={{ backgroundColor: '#e7efe1', color: '#1c5846', padding: '2px 8px', borderRadius: 8, fontWeight: 800 }}>
                2 times this week
              </span>
              . On Oct 29, his phone was first seen at{' '}
              <span style={{ backgroundColor: '#faf0da', color: '#9e6714', padding: '2px 8px', borderRadius: 8, fontWeight: 800 }}>
                08:25
              </span>{' '}
              and was still on at{' '}
              <span style={{ backgroundColor: '#fae8e1', color: '#a84224', padding: '2px 8px', borderRadius: 8, fontWeight: 800 }}>
                00:00
              </span>
              . On Oct 30, his phone was still on at 00:00 again. It could be nice to give him a call and chat when you have a moment to catch up."
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 20 }}>
              <div
                style={{
                  backgroundColor: badgeGlow ? '#1c5846' : '#e7efe1',
                  color: badgeGlow ? 'white' : '#1c5846',
                  border: '1.5px solid #1c5846',
                  borderRadius: 999,
                  padding: '8px 20px',
                  fontSize: 17,
                  fontWeight: 800,
                  boxShadow: badgeGlow ? '0 8px 28px rgba(28,88,70,0.45)' : 'none',
                }}
              >
                Open weights · meta-models/muse-spark-open-1026
              </div>
              <div
                style={{
                  backgroundColor: '#ebefe9',
                  color: '#42544a',
                  borderRadius: 999,
                  padding: '8px 18px',
                  fontSize: 16,
                  fontWeight: 700,
                }}
              >
                Served via Baseten · ≤ 400 chars · Medical filter enforced
              </div>
            </div>
          </div>

          <div
            style={{
              opacity: fade(frame, secondCueAt - 4),
              transform: `translateY(${rise(frame, secondCueAt - 4, 14)}px)`,
              display: 'flex',
              gap: 18,
            }}
          >
            <div style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(207,224,212,0.22)', borderRadius: 18, padding: '16px 22px' }}>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: '#8fd4b5', letterSpacing: 1.5 }}>WHY OPEN WEIGHTS</div>
              <div style={{ fontSize: 18.5, color: 'white', fontWeight: 700, marginTop: 4 }}>
                Independent quota & transparent model badge right on the card.
              </div>
            </div>
            <div style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(207,224,212,0.22)', borderRadius: 18, padding: '16px 22px' }}>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: '#8fd4b5', letterSpacing: 1.5 }}>PRIVACY PRESERVED</div>
              <div style={{ fontSize: 18.5, color: 'white', fontWeight: 700, marginTop: 4 }}>
                Summarizes verified daily notes — never raw notifications or GPS coordinates.
              </div>
            </div>
          </div>
        </div>
      </AbsoluteFill>
      <CaptionBottom seg={seg} voLocal={voLocal} />
    </AbsoluteFill>
  );
};

// ACT 6: Caregiver 3-Screen Triptych (phone-care-list -> phone-care-detail -> phone-care-actions)
export const CaregiverTriptychShot: React.FC<{ seg: number; voLocal: number; dur: number }> = ({ seg, voLocal, dur }) => {
  const frame = useCurrentFrame();
  const stepDur = dur / 3;
  const activeStep = frame < stepDur ? 0 : frame < stepDur * 2 ? 1 : 2;

  const steps = [
    {
      img: STILLS.care[0],
      step: '01 · CAREGIVER OVERVIEW',
      title: 'People You Watch Over',
      sub: 'Needs attention (2) · Status badges: Waiting · Connected · Help',
    },
    {
      img: STILLS.care[1],
      step: '02 · SHARED CONTEXT',
      title: 'Brief, Weekly Review & Timeline',
      sub: "Same weekly note & check-in history synchronized from Ken's phone",
    },
    {
      img: STILLS.care[2],
      step: '03 · EVIDENCE & RESOLUTION',
      title: 'Alerts with Battery & Timestamp',
      sub: 'Battery 85%, not charging · One-tap "Mark seen" & "Help handled"',
    },
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: '#0c1612', fontFamily: FONT }}>
      <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 45%, rgba(28,88,70,0.32), transparent 68%)' }} />

      <AbsoluteFill style={{ padding: '40px 84px 92px', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <Kicker zh="CAREGIVER COUNTERPART · tw.picocare.meta.care" />
            <div style={{ fontSize: 44, fontWeight: 900, color: 'white', marginTop: 8 }}>
              Two Separate Apps. One Shared Truth.
            </div>
          </div>
          <div style={{ fontSize: 19, color: '#9db8a8', fontWeight: 700 }}>
            Ask the elder first → Escalate to family only with evidence
          </div>
        </div>

        <div style={{ display: 'flex', gap: 30, alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
          {steps.map((s, i) => {
            const isActive = i === activeStep;
            const appearAt = i * 14;
            const o = fade(frame, appearAt, 14);
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  opacity: o,
                  transform: `translateY(${isActive ? -8 : 4}px) scale(${isActive ? 1.02 : 0.97})`,
                  backgroundColor: isActive ? 'rgba(28, 88, 70, 0.36)' : 'rgba(255, 255, 255, 0.05)',
                  border: `2px solid ${isActive ? '#7bc4a4' : 'rgba(207,224,212,0.18)'}`,
                  borderRadius: 26,
                  padding: '18px 22px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  boxShadow: isActive ? '0 24px 64px rgba(0,0,0,0.5)' : 'none',
                }}
              >
                <div style={{ width: '100%', marginBottom: 12 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: isActive ? '#8fd4b5' : '#7a9486', letterSpacing: 1.8 }}>{s.step}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'white', marginTop: 3 }}>{s.title}</div>
                  <div style={{ fontSize: 15, color: '#bfd0c5', marginTop: 3, lineHeight: 1.35 }}>{s.sub}</div>
                </div>

                <div
                  style={{
                    width: 264,
                    height: 558,
                    backgroundColor: '#0b120e',
                    borderRadius: 32,
                    padding: 8,
                    boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ width: '100%', height: '100%', borderRadius: 25, overflow: 'hidden', position: 'relative' }}>
                    <Img
                      src={staticFile(s.img)}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'fill',
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ height: 34 }} />
      </AbsoluteFill>
      <CaptionBottom seg={seg} voLocal={voLocal} />
    </AbsoluteFill>
  );
};

const NODES = [
  { num: 'STAGE 01', zh: 'Phone Senses', sub: 'Usage · Media · Location · Battery' },
  { num: 'STAGE 02', zh: 'Local Gates', sub: 'Thin evidence = stay silent' },
  { num: 'STAGE 03', zh: 'Meta Reasons', sub: 'Muse Spark 1.3 + Open Weights' },
  { num: 'STAGE 04', zh: 'Family Rests', sub: 'Verified feed & alert handoff' },
];

// ACT 7: Architecture Pipeline + The 3 Meta Jobs Matrix
export const Pipeline: React.FC<{ seg: number; voLocal: number; dur: number }> = ({ seg, voLocal }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cues = VO[seg].cues;
  const step = cues.reduce((acc, c, i) => (frame >= voLocal + c.start * fps - 4 ? i + 1 : acc), 0);
  const draw = interpolate(frame, [voLocal - 10, voLocal + 50], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
  const pulse = (frame % 75) / 75;

  const jobs = [
    {
      at: voLocal + Math.round((cues[0]?.start ?? 0.05) * fps) - 4,
      model: 'DETERMINISTIC GATE + GUARDRAILS',
      title: '1. Local Evidence Gate & Medical Blocklist',
      desc: 'Requires real multi-sample timestamps. Rejects truncated JSON, invented evidence IDs, or any medical/diagnostic language.',
    },
    {
      at: voLocal + Math.round((cues[1]?.start ?? 5.2) * fps) - 4,
      model: 'META API · muse-spark-1.3',
      title: '2. Weak-Signal Fusion & ELSE Free-Text Triage',
      desc: 'Combines walking distance + repeated navigation + battery into a caring question, and classifies free-text ELSE replies (clarified / needs_contact).',
    },
    {
      at: voLocal + Math.round((cues[2]?.start ?? 11.4) * fps) - 4,
      model: 'OPEN WEIGHTS · muse-spark-open-1026',
      title: '3. Weekly Family Narrative via Baseten',
      desc: 'Turns 7 days of daily findings and check-ins into a warm ≤400-character family summary — impossible with rigid templates.',
    },
  ];

  const activeJob = jobs.reduce((acc, j, i) => (frame >= j.at ? i : acc), 0);

  return (
    <AbsoluteFill style={{ backgroundColor: '#0c1512', fontFamily: FONT, padding: '48px 96px 96px', justifyContent: 'space-between' }}>
      <div style={{ textAlign: 'center', opacity: fade(frame, 6) }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#8fd4b5', letterSpacing: 3, marginBottom: 6 }}>
          HYBRID ARCHITECTURE · LOCAL GATES + META AI
        </div>
        <div style={{ fontSize: 46, fontWeight: 900, color: 'white' }}>
          Thin Evidence? Stay Silent. Rich Clues? Reason with Meta.
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 6 }}>
        {NODES.map((n, i) => {
          const on = i <= step;
          return (
            <React.Fragment key={n.zh}>
              <div
                style={{
                  width: 340,
                  borderRadius: 22,
                  padding: '22px 20px',
                  textAlign: 'center',
                  backgroundColor: on ? GREEN : 'rgba(255,255,255,0.06)',
                  border: `2px solid ${on ? '#8fd4b5' : 'rgba(207,224,212,0.24)'}`,
                  transform: `translateY(${on ? -6 : 0}px)`,
                  boxShadow: on ? '0 18px 48px rgba(28,88,70,0.45)' : 'none',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 800, color: on ? '#cfe8da' : '#859c8e', letterSpacing: 2 }}>{n.num}</div>
                <div style={{ fontSize: 31, fontWeight: 900, color: on ? 'white' : '#9ab0a3', marginTop: 4 }}>{n.zh}</div>
                <div style={{ fontSize: 16, color: on ? '#d9ebe0' : '#7b9184', marginTop: 6 }}>{n.sub}</div>
              </div>
              {i < NODES.length - 1 ? (
                <div style={{ width: 64, height: 4, margin: '0 6px', backgroundColor: 'rgba(207,224,212,0.2)', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, backgroundColor: '#cfe0d4', transform: `scaleX(${draw})`, transformOrigin: 'left' }} />
                  <div style={{ position: 'absolute', top: -4, width: 12, height: 12, borderRadius: 6, backgroundColor: 'white', left: `${pulse * 100}%`, opacity: 0.9 }} />
                </div>
              ) : null}
            </React.Fragment>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 22, marginBottom: 30 }}>
        {jobs.map((j, i) => {
          const isCurrent = i === activeJob;
          const isPast = i < activeJob;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                opacity: isCurrent ? 1 : isPast ? 0.85 : 0.55,
                transform: `translateY(${isCurrent ? -6 : 0}px)`,
                backgroundColor: isCurrent ? '#ffffff' : isPast ? 'rgba(28, 88, 70, 0.34)' : 'rgba(255,255,255,0.08)',
                border: `2px solid ${isCurrent ? '#7bc4a4' : 'rgba(207,224,212,0.22)'}`,
                borderRadius: 22,
                padding: '22px 26px',
                boxShadow: isCurrent ? '0 20px 50px rgba(0,0,0,0.4)' : 'none',
              }}
            >
              <div
                style={{
                  display: 'inline-block',
                  fontSize: 13,
                  fontWeight: 800,
                  color: isCurrent ? '#1c5846' : '#8fd4b5',
                  backgroundColor: isCurrent ? '#e7efe1' : 'rgba(255,255,255,0.1)',
                  borderRadius: 999,
                  padding: '4px 12px',
                  letterSpacing: 1.2,
                }}
              >
                {j.model}
              </div>
              <div style={{ fontSize: 23.5, fontWeight: 900, color: isCurrent ? '#14261d' : 'white', marginTop: 10, lineHeight: 1.25 }}>{j.title}</div>
              <div style={{ fontSize: 17, color: isCurrent ? '#3e5046' : '#c4d6cb', marginTop: 8, lineHeight: 1.45 }}>{j.desc}</div>
            </div>
          );
        })}
      </div>

      <CaptionBottom seg={seg} voLocal={voLocal} />
    </AbsoluteFill>
  );
};

// ACT 8: Finale with Dual Phones + Brand Lockup
export const EndCard: React.FC<{ seg: number; voLocal: number; dur: number }> = ({ seg, voLocal, dur }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <KenBurns src="art-hero.jpg" dur={dur} dim={0.68} fromScale={1.02} toScale={1.08} />
      <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 50%, rgba(12,24,18,0.4), rgba(6,12,9,0.88))' }} />

      <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '0 100px' }}>
        <div style={{ opacity: fade(frame, 6, 16), transform: `translateY(${rise(frame, 6, 18, 28)}px) rotate(-4deg)` }}>
          <FocusedPhone src={STILLS.weekly[0]} dur={dur} width={300} height={638} zoomFrom={1.0} zoomTo={1.03} panYFrom={0} panYTo={-6} />
        </div>

        <div style={{ textAlign: 'center', maxWidth: 820, zIndex: 2 }}>
          <div
            style={{
              opacity: fade(frame, 4),
              display: 'inline-block',
              fontSize: 17,
              fontWeight: 800,
              letterSpacing: 2.5,
              color: '#8fd4b5',
              backgroundColor: 'rgba(28,88,70,0.45)',
              border: '1px solid rgba(143,212,181,0.4)',
              borderRadius: 999,
              padding: '8px 22px',
              marginBottom: 18,
            }}
          >
            THE PHONE WATCHES QUIETLY · THE SECRETARY THINKS · THE FAMILY RESTS EASY
          </div>
          <div
            style={{
              opacity: fade(frame, 8),
              transform: `translateY(${rise(frame, 8, 14)}px)`,
              fontSize: 116,
              fontWeight: 900,
              color: 'white',
              lineHeight: 1.05,
            }}
          >
            PicoCare
          </div>
          <div style={{ opacity: fade(frame, voLocal), fontSize: 42, fontWeight: 800, color: '#e7efe1', marginTop: 16 }}>
            No medical advice. No false alarms. Only care.
          </div>
          <div style={{ opacity: fade(frame, voLocal + 24), marginTop: 28, fontSize: 21, color: '#9db8a8', letterSpacing: 1.5, fontWeight: 600 }}>
            Meta Global AI Developer Hackathon 2026 · Built with Meta Muse Spark & Open Weights
          </div>
        </div>

        <div style={{ opacity: fade(frame, 10, 16), transform: `translateY(${rise(frame, 10, 18, 28)}px) rotate(4deg)` }}>
          <FocusedPhone src={STILLS.care[0]} dur={dur} width={300} height={638} zoomFrom={1.0} zoomTo={1.03} panYFrom={0} panYTo={-6} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
