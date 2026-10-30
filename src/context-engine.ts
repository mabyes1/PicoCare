import type { PhoneContext, ContextDecision } from '../shared/protocol.ts';
import type { Lang } from './lang.ts';
export type ContextSample = { id: string; at: number; context: PhoneContext };
export interface SituationInterpreter { evaluate(samples: ContextSample[], now: number, lang?: Lang): ContextDecision }
const minute = 60000;
const fresh = (at: number, now: number) => at <= now && now - at <= 2 * minute;
export const hasVideo = (s: ContextSample, now: number) => {
  const c = s.context;
  return fresh(s.at, now) && c.sources?.usage === 'available' && c.sources.media === 'available' && c.screenInteractive === true &&
    c.usage?.category === 'video' && c.media?.state === 'playing' && c.usage.appId === c.media.appId &&
    fresh(c.usage.observedAt, now) && fresh(c.media.observedAt, now);
};
export function distance(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = Math.PI / 180, dLat = (b.latitude - a.latitude) * rad, dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export class LocalSituationInterpreter implements SituationInterpreter {
  evaluate(input: ContextSample[], now: number, lang: Lang = 'zh'): ContextDecision {
    const en = lang === 'en';
    const samples = [...input].filter(s => s.at <= now && now - s.at <= 45 * minute).sort((a, b) => a.at - b.at);
    const latest = samples.at(-1);
    const base: ContextDecision = { source: 'local_evidence', scenario: 'unknown', action: 'none', title: en ? 'Waiting for phone data' : '等手機更新',
      reason: '', at: now, validUntil: now + 2 * minute, evidence: [], alternatives: [], gaps: [] };
    if (!latest || !fresh(latest.at, now)) return base;
    const c = latest.context;
    base.title = c.screenInteractive === false ? (en ? 'Phone screen is off' : '手機螢幕已關閉') : c.screenInteractive === true ? (en ? 'Phone screen is on' : '手機螢幕開啟') : (en ? 'Phone status updated' : '手機狀態已更新');
    // Build a contiguous series of independent fixes. Re-uploading a cached fix is not another movement sample.
    let points: (ContextSample & { fix: NonNullable<PhoneContext['location']> })[] = [];
    for (const s of samples) {
      const p = s.context.location;
      if (!p || !['available', 'speed_unavailable'].includes(s.context.sources?.location || '') || p.accuracy > 50 || p.observedAt > s.at || s.at - p.observedAt > 2 * minute) continue;
      const last = points.at(-1);
      if (last && p.observedAt <= last.fix.observedAt) continue;
      if (last && (p.observedAt - last.fix.observedAt > 3 * minute || Math.max(0, distance(last.fix, p) - last.fix.accuracy - p.accuracy) / ((p.observedAt - last.fix.observedAt) / 1000) > 50)) points = [];
      points.push({ ...s, fix: p });
    }
    const last = points.at(-1), first = points[0];
    let travelled = 0, revisit = false;
    for (let i = 1; i < points.length; i++) travelled += Math.max(0, distance(points[i - 1].fix, points[i].fix) - points[i - 1].fix.accuracy - points[i].fix.accuracy);
    // A revisit requires a definite excursion and a later definite return, including accuracy margins.
    for (let i = 0; i < points.length - 2 && !revisit; i++) {
      let away = false;
      for (let j = i + 1; j < points.length; j++) {
        const d = distance(points[i].fix, points[j].fix), uncertainty = points[i].fix.accuracy + points[j].fix.accuracy;
        if (d - uncertainty > 150) away = true;
        if (away && d + uncertainty < 90 && points[j].fix.observedAt - points[i].fix.observedAt >= 5 * minute) { revisit = true; break; }
      }
    }
    const navigation = c.sources?.notifications === 'available' && c.notifications.find(n => n.category === 'navigation' && fresh(n.observedAt, now));
    const earlierBattery = samples.find(s => s.context.batteryPercent !== null && latest.at - s.at >= 5 * minute);
    const draining = c.batteryPercent !== null && c.batteryPercent <= 15 && c.charging === false && earlierBattery?.context.batteryPercent !== null && earlierBattery !== undefined && earlierBattery.context.batteryPercent! - c.batteryPercent >= 5;
    if (c.location && c.location.accuracy <= 50 && ['available', 'speed_unavailable'].includes(c.sources?.location || '') && first && last && c.location.observedAt === last.fix.observedAt && fresh(last.fix.observedAt, now) && points.length >= 8 && last.fix.observedAt - first.fix.observedAt >= 8 * minute && travelled >= 400 && revisit && navigation && draining) {
      return { ...base, scenario: 'outing', action: 'confirm', title: en ? 'Outing changed in a way worth confirming' : '外出行程出現值得確認的變化',
        reason: en ? 'You looped back to the same area, navigation is still on, and the battery is low. Want to ask if you need help finding your way.' : '剛才繞回同一個區域，導航還開著，電量也偏低。想問你是否需要找路協助。',
        evidence: [
          { eventId: first.id, observedAt: first.fix.observedAt, label: en ? `Path start; ${points.length} distinct fixes, at least ${Math.round(travelled)}m travelled after accuracy margins` : `路徑開始；共 ${points.length} 個不同定位，扣除精度誤差後移動至少 ${Math.round(travelled)}m` },
          { eventId: last.id, observedAt: last.fix.observedAt, label: en ? 'Left and returned to the earlier area; fixes under three minutes apart, all within 50m accuracy' : '離開後再次回到先前區域；定位間隔均不超過三分鐘、精度均在 50m 內' },
          { eventId: latest.id, observedAt: navigation.observedAt, label: en ? 'Navigation notification still present at sample time' : '取樣時仍有導航通知' },
          { eventId: latest.id, observedAt: latest.at, label: en ? `Phone battery ${c.batteryPercent}%, not charging; down at least 5 points from the earlier stretch` : `手機電量 ${c.batteryPercent}%，未充電；較前段降低至少 5 個百分點` }
        ], alternatives: [], gaps: [] };
    }
    if (hasVideo(latest, now)) {
      const chain: ContextSample[] = [latest];
      for (let i = samples.length - 2; i >= 0; i--) {
        const s = samples[i], next = chain[0];
        if (next.at - s.at > 90000 || s.context.usage?.appId !== c.usage!.appId || !hasVideo(s, s.at)) break;
        if (s.at < next.at) chain.unshift(s);
      }
      if (chain.length >= 3 && latest.at - chain[0].at >= 2 * minute) return { ...base, scenario: 'video', action: 'wait', title: en ? 'Probably watching a video; check-in deferred' : '可能正在看影片，先延後確認',
        reason: en ? 'Video has played for two minutes; the check-in reminder comes later.' : '影片已持續播放兩分鐘，晚點再提醒報安。',
        evidence: [ { eventId: chain[0].id, observedAt: chain[0].at, label: en ? 'Consistent audio-video usage clues first observed' : '開始觀測到一致的影音使用線索' },
          { eventId: latest.id, observedAt: c.usage!.observedAt, label: en ? 'Video app still in foreground, device interactive' : '影音 App 仍在前景，裝置可互動' },
          { eventId: latest.id, observedAt: c.media!.observedAt, label: en ? 'Same app reports media state playing' : '同一 App 的媒體播放狀態為播放中' } ],
        alternatives: [], gaps: [] };
    }
    return base;
  }
}
