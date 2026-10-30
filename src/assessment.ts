import type { Context } from './domain.ts';

import type { Assessment } from '../shared/protocol.ts';
import type { Lang } from './lang.ts';
export type { Assessment } from '../shared/protocol.ts';
export interface ContextProvider {
  assess(context: Context | null, observedAt: number | null, now: number, lang?: Lang): Assessment;
}
// Read-time translation of stored Chinese labels (history keeps its facts;
// only the fixed template shells are swapped, values pass through verbatim).
export function evidenceLabelEn(label: string): string {
  const map: [string, string][] = [
    ['最後一次情境同步', 'Last context sync'],
    ['定位速度顯示手機有移動線索', 'Location speed suggests the phone is moving'],
    ['定位速度顯示手機暫時靜止', 'Location speed suggests the phone is still for now'],
    ['手機有導航通知線索', 'Phone shows navigation notification clues'],
    ['手機有通話通知線索', 'Phone shows call notification clues'],
    ['取樣時裝置可互動', 'Device was interactive at sample time'],
    ['取樣時裝置不可互動', 'Device was not interactive at sample time'],
    ['缺少有來源時間及精度的近期移動資訊', 'Missing recent movement info with source time and accuracy'],
    ['目前生活情境無法確認', 'Current life context cannot be confirmed'],
  ];
  for (const [zh, en] of map) if (label === zh) return en;
  const battery = label.match(/^電量 (\d+)%(.*)$/);
  if (battery) return `Battery ${battery[1] || '?'}%${(battery[2] || '').replace('，充電中', ', charging')}`;
  const gap = label.match(/^(.+)來源：(.+)$/);
  if (gap) {
    const sources: Record<string, string> = { '定位': 'Location', '通知': 'Notifications', '前景 App': 'Foreground app', '播放狀態': 'Playback' };
    const states: Record<string, string> = { '未啟用': 'off', '未授權': 'not authorized', '採集服務未連接': 'collector not connected', '沒有定位': 'no fix', '觀測過期': 'stale reading', '精度不足': 'poor accuracy', '缺少速度精度': 'missing speed accuracy', '採集失敗': 'collection failed' };
    const src = sources[gap[1] || ''], st = states[gap[2] || ''];
    if (src && st) return `${src} source: ${st}`;
  }
  return label;
}
// Deterministic scaffolding for the data pipeline. No model request is made here.
export class LocalContextProvider implements ContextProvider {
  assess(c: Context | null, observedAt: number | null, now: number, lang: Lang = 'zh'): Assessment {
    const en = lang === 'en';
    const a: Assessment = { source: 'rules', meta: 'not_configured', state: 'unknown', title: en ? 'Waiting for phone data' : '等候手機更新',
      explanation: en ? 'Recent life-context clues will appear here once the phone connects.' : '手機連線後，這裡會呈現最近的生活情境線索。', evidence: [], gaps: [], nextAction: en ? 'Finish phone pairing and sync first' : '先完成手機配對與同步' };
    if (!c || !observedAt) return a;
    if (now - observedAt > 120000) {
      return { ...a, state: 'stale', title: en ? 'Information needs a refresh' : '目前資訊需要更新', explanation: en ? 'The latest phone data is over two minutes old; the previous read is kept for reference.' : '最近一筆手機資料已超過兩分鐘，先前情境保留供參考。',
        evidence: [{ label: en ? 'Last context sync' : '最後一次情境同步', observedAt }], gaps: [en ? 'Current life context cannot be confirmed' : '目前生活情境無法確認'], nextAction: en ? 'Ask the phone to update first; contact the person directly if needed' : '先請手機更新；需要時直接聯絡本人' };
    }
    a.state = 'fresh'; a.title = en ? 'Phone status updated' : '手機狀態已更新'; a.explanation = c.screenInteractive === true ? (en ? 'Screen is currently on.' : '目前螢幕開啟。') : c.screenInteractive === false ? (en ? 'Screen is currently off.' : '目前螢幕關閉。') : ''; a.nextAction = en ? 'Check the latest phone information' : '查看最近的手機資訊';
    const recent = c.sources && c.sources.notifications !== 'available' ? [] : c.notifications.filter(n => now >= n.observedAt && now - n.observedAt <= 120000);
    const motionAt = c.motionEvidence?.observedAt;
    const usableMotion = c.motionEvidence && motionAt !== undefined && now >= motionAt && now - motionAt <= 120000 && c.motionEvidence.accuracy <= 150;
    if (usableMotion && c.motion !== 'unknown') a.evidence.push({ label: c.motion === 'moving' ? (en ? 'Location speed suggests the phone is moving' : '定位速度顯示手機有移動線索') : (en ? 'Location speed suggests the phone is still for now' : '定位速度顯示手機暫時靜止'), observedAt: motionAt! });
    for (const n of recent.filter(n => n.category !== 'other')) a.evidence.push({ label: n.category === 'navigation' ? (en ? 'Phone shows navigation notification clues' : '手機有導航通知線索') : (en ? 'Phone shows call notification clues' : '手機有通話通知線索'), observedAt: n.observedAt });
    if (recent.some(n => n.category === 'navigation') && usableMotion && c.motion === 'moving') {
      a.title = en ? 'May be out and about' : '可能正在外出途中'; a.explanation = en ? 'Navigation and movement clues appear together; prefer a reminder that does not interrupt the trip.' : '手機同時出現導航與移動線索，可先使用不打斷行程的提醒。'; a.nextAction = en ? 'Send a notification first and wait until it is convenient to reply' : '先發送通知，等待本人方便時回覆';
    } else if (recent.some(n => n.category === 'call')) {
      a.title = en ? 'Phone shows signs of an ongoing call' : '手機有通話中的線索'; a.explanation = en ? 'Recent notifications carry call clues; a reply may be inconvenient right now.' : '近期通知帶有通話線索，可能暫時不便回覆。';
    } else if (c.charging && c.screenInteractive) {
      a.title = en ? 'Phone is charging' : '手機正在充電'; a.explanation = en ? 'Screen is currently on.' : '目前螢幕開啟。';
    }
    if (c.batteryPercent !== null) a.evidence.push({ label: en ? `Battery ${c.batteryPercent}%${c.charging ? ', charging' : ''}` : `電量 ${c.batteryPercent}%${c.charging ? '，充電中' : ''}`, observedAt });
    if (c.screenInteractive !== null) a.evidence.push({ label: c.screenInteractive ? (en ? 'Device was interactive at sample time' : '取樣時裝置可互動') : (en ? 'Device was not interactive at sample time' : '取樣時裝置不可互動'), observedAt });
    if (c.batteryPercent !== null && c.batteryPercent <= 15 && c.charging === false) a.nextAction = en ? 'Remind to charge first, so contact is not lost to a dead battery' : '先提醒充電，避免手機沒電後失去聯絡';
    if (!usableMotion || c.motion === 'unknown') a.gaps.push(en ? 'Missing recent movement info with source time and accuracy' : '缺少有來源時間及精度的近期移動資訊');
    const states: Record<string, string> = en
      ? { disabled: 'off', permission_missing: 'not authorized', disconnected: 'collector not connected', no_fix: 'no fix', stale: 'stale reading', inaccurate: 'poor accuracy', speed_unavailable: 'missing speed accuracy', error: 'collection failed' }
      : { disabled: '未啟用', permission_missing: '未授權', disconnected: '採集服務未連接', no_fix: '沒有定位', stale: '觀測過期', inaccurate: '精度不足', speed_unavailable: '缺少速度精度', error: '採集失敗' };
    const sources: Record<string, string> = en
      ? { location: 'Location', notifications: 'Notifications', usage: 'Foreground app', media: 'Playback' }
      : { location: '定位', notifications: '通知', usage: '前景 App', media: '播放狀態' };
    if (c.sources) for (const [source, state] of Object.entries(c.sources)) if (state !== 'available') a.gaps.push(en ? `${sources[source]} source: ${states[state]}` : `${sources[source]}來源：${states[state]}`);
    return a;
  }
}
export const metaIntegration = { status: 'not_configured', enabled: false, model: null } as const;
