// Manual, paid synthetic evaluation. Never included in npm test or server startup.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MetaApi, MetaApiError, metaConfig, metaInput } from '../src/meta-api.ts';
import { LocalSituationInterpreter } from '../src/context-engine.ts';
import type { ContextSample } from '../src/context-engine.ts';
import type { PhoneContext } from '../shared/protocol.ts';

const config = metaConfig();
if (!config.enabled || !config.key) throw new Error('Configure the local Meta key first');
const base = Date.now(), minute = 60000;
const context = (): PhoneContext => ({ batteryPercent: 80, charging: false, screenInteractive: true, network: 'online', ringer: 'normal', motion: 'unknown',
  notifications: [], location: null, sharing: 'summary', sources: { usage: 'available', media: 'available', notifications: 'available', location: 'disabled' } });
const asleep: ContextSample[] = [{ id: 'synthetic-idle', at: base, context: { ...context(), screenInteractive: false } }];
const video = [0, 1, 2].map((n): ContextSample => ({ id: `synthetic-video-${n}`, at: base - (2 - n) * minute, context: { ...context(),
  usage: { appId: 'com.google.android.youtube', category: 'video', observedAt: base - (2 - n) * minute, changedAt: base - 2 * minute },
  media: { appId: 'com.google.android.youtube', state: 'playing', observedAt: base - (2 - n) * minute } } }));
const stopped = video.map(s => structuredClone(s)); stopped[2].context.media!.state = 'paused';
const square = [[25, 121], [25.002, 121], [25.002, 121.002], [25, 121.002]];
const outing: ContextSample[] = Array.from({ length: 9 }, (_, n) => {
  const at = base - (8 - n) * minute, [latitude, longitude] = square[n % 4];
  return { id: `synthetic-outing-${n}`, at, context: { ...context(), batteryPercent: 25 - 2 * n, sharing: 'detailed',
    sources: { usage: 'permission_missing', media: 'available', notifications: 'available', location: 'available' },
    notifications: [{ category: 'navigation', observedAt: at, postedAt: base - 8 * minute }], location: { latitude, longitude, accuracy: 10, observedAt: at } } };
});
const cases = [{ name: '螢幕關閉，不能斷定睡覺或平安', samples: asleep, expectedAction: 'none' },
  { name: '持續看片，可延後確認', samples: video, expectedAction: 'wait' },
  { name: '影片已暫停，不能繼續視為看片', samples: stopped, expectedAction: 'none' },
  { name: '外出路徑變化、導航、電量下降，先問本人', samples: outing, expectedAction: 'confirm' }];
const results: Record<string, unknown>[] = [];
for (const model of process.argv.includes('--spark-only') ? ['muse-spark-1.3'] : ['muse-spark-1.3', 'muse-wonder-1.0']) {
  for (const scenario of cases) {
    // Rebase synthetic timestamps so evaluation latency doesn't age the evidence.
    const now = Date.now(), offset = now - base, samples = structuredClone(scenario.samples);
    for (const s of samples) { s.at += offset; for (const field of [s.context.usage, s.context.media, s.context.location]) if (field) field.observedAt += offset;
      if (s.context.usage) s.context.usage.changedAt += offset; for (const n of s.context.notifications) { n.observedAt += offset; if (n.postedAt) n.postedAt += offset; } }
    const input = metaInput(samples, now, new LocalSituationInterpreter().evaluate(samples, now))!;
    const started = performance.now();
    try {
      const r = await new MetaApi({ ...config, model }).infer(input, now);
      const result = { model, scenario: scenario.name, milliseconds: Math.round(performance.now() - started), valid: true,
        expectedAction: scenario.expectedAction, action: r.decision.action, actionMatches: r.decision.action === scenario.expectedAction,
        title: r.decision.title, reason: r.decision.reason, alternatives: r.decision.alternatives, gaps: r.decision.gaps, inputTokens: r.inputTokens, outputTokens: r.outputTokens };
      results.push(result); console.log(JSON.stringify(result));
    } catch (error) {
      const code = error instanceof MetaApiError ? error.code : 'internal_error';
      const result = { model, scenario: scenario.name, milliseconds: Math.round(performance.now() - started), valid: false, error: code };
      results.push(result); console.log(JSON.stringify(result));
      if (['http_401', 'http_403', 'http_404'].includes(code)) break;
    }
  }
}
mkdirSync('.local', { recursive: true });
writeFileSync(join('.local', process.argv.includes('--spark-only') ? 'meta-tone-check.json' : 'meta-comparison.json'), JSON.stringify({ generatedAt: new Date().toISOString(), data: 'synthetic_only', reasoningEffort: 'low', maxCompletionTokens: config.maxTokens, results }, null, 2));
