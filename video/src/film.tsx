import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';
import { FONT, GREEN, PAPER } from './cards';
import { VO } from './captions';
import { FOOTAGE, STILLS } from './footage';
import { CareScreen, WallScreen, WeeklyScreen } from './phone';

// Motion language (Corporate-premium, calm-sharp): one ease, 12f base unit,
// crossfades only, 60ms stagger, holds after every beat.
const EASE = Easing.bezier(0.22, 1, 0.36, 1);
const rise = (frame: number, at: number, len = 12) => interpolate(frame, [at, at + len], [26, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
const fade = (frame: number, at: number, len = 10) => interpolate(frame, [at, at + len], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

export const Shot: React.FC<{ dur: number; first?: boolean; last?: boolean; children: React.ReactNode }> = ({ dur, first, last, children }) => {
  const frame = useCurrentFrame();
  const fadeIn = first ? 1 : fade(frame, 0, 12);
  const fadeOut = last ? 1 : interpolate(frame, [dur - 12, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut) }}>{children}</AbsoluteFill>;
};

export const KenBurns: React.FC<{ src: string; dur: number; dim?: number }> = ({ src, dur, dim = 0.45 }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, dur], [1, 1.09], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const y = interpolate(frame, [0, dur], [0, -18], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill>
      <Img src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale}) translateY(${y}px)` }} />
      <AbsoluteFill style={{ backgroundColor: `rgba(8,14,11,${dim})` }} />
    </AbsoluteFill>
  );
};

// Cue-synced stacked lines. Latest line is white, earlier ones dim.
export const KineticLines: React.FC<{ seg: number; voLocal: number; size?: number; align?: 'left' | 'center'; tone?: 'dark' | 'light'; only?: number[] }> = ({ seg, voLocal, size = 62, align = 'left', tone = 'dark', only }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cues = VO[seg].cues.map((c, i) => ({ ...c, i })).filter((c) => !only || only.includes(c.i));
  const active = cues.reduce((acc, c, i) => (frame >= voLocal + c.start * fps - 4 ? i : acc), -1);
  const ink = tone === 'dark' ? 'white' : '#0c1512';
  const sub = tone === 'dark' ? '#cfe0d4' : '#205c4a';
  return (
    <div style={{ fontFamily: FONT, textAlign: align, width: align === 'center' ? '100%' : 1180 }}>
      {cues.map((c, i) => {
        const at = voLocal + c.start * fps - 4;
        const o = i <= active ? fade(frame, at) : 0;
        if (o <= 0) return <div key={i} style={{ height: 0 }} />;
        return (
          <div key={i} style={{ opacity: o * (i === active ? 1 : 0.55), transform: `translateY(${rise(frame, at)}px)`, marginTop: i === 0 ? 0 : 26 }}>
            <div style={{ fontSize: size, fontWeight: 900, color: ink, lineHeight: 1.3, textShadow: tone === 'dark' ? '0 4px 30px rgba(0,0,0,0.5)' : 'none' }}>{c.zh}</div>
            {c.en ? <div style={{ fontSize: Math.round(size * 0.42), color: sub, marginTop: 10 }}>{c.en}</div> : null}
          </div>
        );
      })}
    </div>
  );
};

// Broadcast lower-third: current cue only.
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
      <div style={{ opacity: o, backgroundColor: 'rgba(6,12,9,0.78)', borderRadius: 18, padding: '18px 40px', marginBottom: width > 1400 ? 54 : 120, maxWidth: '88%', textAlign: 'center', border: '1px solid rgba(207,224,212,0.18)' }}>
        <div style={{ color: 'white', fontSize: width > 1400 ? 38 : 44, fontWeight: 700, lineHeight: 1.35 }}>{c.zh}</div>
        {c.en ? <div style={{ color: '#9db8a8', fontSize: width > 1400 ? 25 : 30, marginTop: 8 }}>{c.en}</div> : null}
      </div>
    </AbsoluteFill>
  );
};

export const Kicker: React.FC<{ zh: string; en: string; at?: number }> = ({ zh, en, at = 14 }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ opacity: fade(frame, at), transform: `translateY(${rise(frame, at)}px)`, fontFamily: FONT }}>
      <div style={{ display: 'inline-block', fontSize: 24, fontWeight: 800, letterSpacing: 6, color: '#0c1512', backgroundColor: PAPER, borderRadius: 10, padding: '10px 22px' }}>{zh}</div>
      {en ? <div style={{ fontSize: 22, color: '#9db8a8', marginTop: 10, letterSpacing: 2 }}>{en}</div> : null}
    </div>
  );
};

// Real-device stills inside the device chrome. Stills crossfade on the 12f unit
// with a slow Ken Burns drift so frozen screenshots read as footage.
export const StillsDevice: React.FC<{ stills: readonly string[]; dur: number; scale?: number; shiftY?: number }> = ({ stills, dur, scale = 1, shiftY = 0 }) => {
  const frame = useCurrentFrame();
  const n = Math.max(1, stills.length);
  const slot = dur / n;
  return (
    <div style={{ width: 520, height: 1040, backgroundColor: '#0a0f0c', borderRadius: 60, padding: 16, transform: `translateY(${shiftY}px) scale(${scale})`, boxShadow: '0 40px 120px rgba(0,0,0,0.6), 0 0 0 1px rgba(207,224,212,0.15)' }}>
      <div style={{ width: '100%', height: '100%', backgroundColor: '#000', borderRadius: 46, overflow: 'hidden', position: 'relative' }}>
        {stills.map((s, i) => {
          const at = i * slot;
          const local = frame - at;
          const oIn = interpolate(frame, [at, at + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const oOut = i === n - 1 ? 1 : interpolate(frame, [at + slot - 12, at + slot], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const zoom = interpolate(local, [0, slot], [1, 1.06], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const drift = interpolate(local, [0, slot], [0, -14], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          if (frame < at || frame > at + slot) return null;
          return <Img key={s + i} src={staticFile(s)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: Math.min(oIn, oOut), transform: `scale(${zoom}) translateY(${drift}px)` }} />;
        })}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 220, background: 'linear-gradient(rgba(255,255,255,0.10), transparent)', pointerEvents: 'none' }} />
      </div>
    </div>
  );
};

export const PhoneShot: React.FC<{ kind: 'wall' | 'weekly' | 'care'; seg: number; voLocal: number; kicker: string; kickerEn: string; dur: number }> = ({ kind, seg, voLocal, kicker, kickerEn, dur }) => {
  const recon = kind === 'wall' ? <WallScreen /> : kind === 'weekly' ? <WeeklyScreen /> : <CareScreen />;
  const stills = STILLS[kind];
  const body = FOOTAGE[kind] && stills.length > 0 ? <StillsDevice stills={stills} dur={dur} /> : recon;
  return (
    <AbsoluteFill style={{ backgroundColor: '#0c1512' }}>
      {FOOTAGE[kind] && stills.length > 0 ? (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>{body}</AbsoluteFill>
      ) : body}
      <AbsoluteFill style={{ padding: '60px 80px 0', justifyContent: 'flex-start', pointerEvents: 'none' }}>
        <Kicker zh={kicker} en={kickerEn} />
      </AbsoluteFill>
      <CaptionBottom seg={seg} voLocal={voLocal} />
    </AbsoluteFill>
  );
};

const NODES = [
  { zh: 'Phone senses', en: '' },
  { zh: 'Local gates', en: '' },
  { zh: 'Meta reasons', en: '' },
  { zh: 'Family rests', en: '' },
];

// How-it-works diagram. Nodes light up with the VO cues.
export const Pipeline: React.FC<{ seg: number; voLocal: number; dur: number }> = ({ seg, voLocal, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cues = VO[seg].cues;
  const step = cues.reduce((acc, c, i) => (frame >= voLocal + c.start * fps - 4 ? i + 1 : acc), 0);
  const draw = interpolate(frame, [voLocal - 20, voLocal + 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
  const pulse = (frame % 90) / 90;
  return (
    <AbsoluteFill style={{ backgroundColor: '#0c1512', fontFamily: FONT, alignItems: 'center' }}>
      <div style={{ position: 'absolute', top: 80, textAlign: 'center', opacity: fade(frame, 10) }}>
        <div style={{ fontSize: 54, fontWeight: 900, color: 'white' }}>Thin evidence? Stay silent.</div>
        <div style={{ fontSize: 26, color: '#9db8a8', marginTop: 8 }}>The pipeline that refuses to guess</div>
      </div>
      <div style={{ position: 'absolute', top: 300, display: 'flex', alignItems: 'center' }}>
        {NODES.map((n, i) => {
          const on = i <= step;
          return (
            <React.Fragment key={n.zh}>
              <div style={{ width: 300, borderRadius: 24, padding: '34px 20px', textAlign: 'center', backgroundColor: on ? GREEN : 'rgba(255,255,255,0.05)',
                border: `2px solid ${on ? '#cfe0d4' : 'rgba(207,224,212,0.25)'}`, transform: `translateY(${on ? -8 : 0}px)`,
                boxShadow: on ? '0 20px 60px rgba(32,92,74,0.45)' : 'none' }}>
                <div style={{ fontSize: 36, fontWeight: 900, color: on ? 'white' : '#5c6f63', whiteSpace: 'nowrap' }}>{n.zh}</div>
                {n.en ? <div style={{ fontSize: 21, letterSpacing: 3, color: on ? '#cfe0d4' : '#43564b', marginTop: 10 }}>{n.en}</div> : null}
              </div>
              {i < NODES.length - 1 ? (
                <div style={{ width: 90, height: 4, margin: '0 6px', backgroundColor: 'rgba(207,224,212,0.2)', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, backgroundColor: '#cfe0d4', transform: `scaleX(${draw})`, transformOrigin: 'left' }} />
                  <div style={{ position: 'absolute', top: -4, width: 12, height: 12, borderRadius: 6, backgroundColor: 'white', left: `${pulse * 100}%`, opacity: 0.9 }} />
                </div>
              ) : null}
            </React.Fragment>
          );
        })}
      </div>
      <div style={{ position: 'absolute', bottom: 90 }}>
        <KineticLines seg={seg} voLocal={voLocal} size={42} align="center" />
      </div>
    </AbsoluteFill>
  );
};

export const Reveal: React.FC<{ seg: number; voLocal: number }> = ({ seg, voLocal }) => {
  const frame = useCurrentFrame();
  const word = 'PicoCare';
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <Img src={staticFile('art-paper.jpg')} style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover' }} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', marginBottom: 30 }}>
          {word.split('').map((ch, i) => {
            const at = voLocal - 30 + i * 2;
            return <div key={i} style={{ opacity: fade(frame, at), transform: `translateY(${rise(frame, at, 14)}px)`, fontSize: 150, fontWeight: 900, color: '#0c1512' }}>{ch}</div>;
          })}
        </div>
        <div style={{ opacity: fade(frame, voLocal - 10), fontSize: 34, color: '#205c4a', fontWeight: 700, letterSpacing: 4, marginBottom: 26 }}>ELDER CARE SECRETARY</div>
        <KineticLines seg={seg} voLocal={voLocal} size={52} align="center" tone="light" />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const EndCard: React.FC<{ seg: number; voLocal: number; dur: number }> = ({ seg, voLocal, dur }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <KenBurns src="art-hero.jpg" dur={dur} dim={0.62} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div style={{ opacity: fade(frame, voLocal - 24), transform: `translateY(${rise(frame, voLocal - 24, 14)}px)`, fontSize: 120, fontWeight: 900, color: 'white' }}>PicoCare</div>
        <div style={{ marginTop: 18 }}>
          <KineticLines seg={seg} voLocal={voLocal} size={56} align="center" only={[0]} />
        </div>
        <div style={{ opacity: fade(frame, dur - 220), marginTop: 34, fontSize: 28, color: '#cfe0d4', letterSpacing: 2 }}>Meta Global AI Developer Hackathon · Built with Meta Muse & open weights</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
