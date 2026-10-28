import type { Context } from './domain.ts';

import type { Assessment } from '../shared/protocol.ts';
export type { Assessment } from '../shared/protocol.ts';
export interface ContextProvider {
  assess(context: Context | null, observedAt: number | null, now: number): Assessment;
}
// Deterministic scaffolding for the data pipeline. No model request is made here.
export class LocalContextProvider implements ContextProvider {
  assess(c: Context | null, observedAt: number | null, now: number): Assessment {
    const a: Assessment = { source: 'rules', meta: 'not_configured', state: 'unknown', title: '等候手機更新',
      explanation: '手機連線後，這裡會呈現最近的生活情境線索。', evidence: [], gaps: [], nextAction: '先完成手機配對與同步' };
    if (!c || !observedAt) return a;
    if (now - observedAt > 120000) {
      return { ...a, state: 'stale', title: '目前資訊需要更新', explanation: '最近一筆手機資料已超過兩分鐘，先前情境保留供參考。',
        evidence: [{ label: '最後一次情境同步', observedAt }], gaps: ['目前生活情境無法確認'], nextAction: '先請手機更新；需要時直接聯絡本人' };
    }
    a.state = 'fresh'; a.title = '手機狀態已更新'; a.explanation = c.screenInteractive === true ? '目前螢幕開啟。' : c.screenInteractive === false ? '目前螢幕關閉。' : ''; a.nextAction = '查看最近的手機資訊';
    const recent = c.sources && c.sources.notifications !== 'available' ? [] : c.notifications.filter(n => now >= n.observedAt && now - n.observedAt <= 120000);
    const motionAt = c.motionEvidence?.observedAt;
    const usableMotion = c.motionEvidence && motionAt !== undefined && now >= motionAt && now - motionAt <= 120000 && c.motionEvidence.accuracy <= 150;
    if (usableMotion && c.motion !== 'unknown') a.evidence.push({ label: c.motion === 'moving' ? '定位速度顯示手機有移動線索' : '定位速度顯示手機暫時靜止', observedAt: motionAt! });
    for (const n of recent.filter(n => n.category !== 'other')) a.evidence.push({ label: n.category === 'navigation' ? '手機有導航通知線索' : '手機有通話通知線索', observedAt: n.observedAt });
    if (recent.some(n => n.category === 'navigation') && usableMotion && c.motion === 'moving') {
      a.title = '可能正在外出途中'; a.explanation = '手機同時出現導航與移動線索，可先使用不打斷行程的提醒。'; a.nextAction = '先發送通知，等待本人方便時回覆';
    } else if (recent.some(n => n.category === 'call')) {
      a.title = '手機有通話中的線索'; a.explanation = '近期通知帶有通話線索，可能暫時不便回覆。';
    } else if (c.charging && c.screenInteractive) {
      a.title = '手機正在充電'; a.explanation = '目前螢幕開啟。';
    }
    if (c.batteryPercent !== null) a.evidence.push({ label: `電量 ${c.batteryPercent}%${c.charging ? '，充電中' : ''}`, observedAt });
    if (c.screenInteractive !== null) a.evidence.push({ label: c.screenInteractive ? '取樣時裝置可互動' : '取樣時裝置不可互動', observedAt });
    if (c.batteryPercent !== null && c.batteryPercent <= 15 && c.charging === false) a.nextAction = '先提醒充電，避免手機沒電後失去聯絡';
    if (!usableMotion || c.motion === 'unknown') a.gaps.push('缺少有來源時間及精度的近期移動資訊');
    const states: Record<string, string> = { disabled: '未啟用', permission_missing: '未授權', disconnected: '採集服務未連接', no_fix: '沒有定位', stale: '觀測過期', inaccurate: '精度不足', speed_unavailable: '缺少速度精度', error: '採集失敗' };
    if (c.sources) for (const [source, state] of Object.entries(c.sources)) if (state !== 'available') a.gaps.push(`${({ location: '定位', notifications: '通知', usage: '前景 App', media: '播放狀態' } as Record<string, string>)[source]}來源：${states[state]}`);
    return a;
  }
}
export const metaIntegration = { status: 'not_configured', enabled: false, model: null } as const;
