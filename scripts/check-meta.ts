import { MetaApi, MetaApiError, metaConfig, metaInput } from '../src/meta-api.ts';
import { LocalSituationInterpreter } from '../src/context-engine.ts';
import type { ContextSample } from '../src/context-engine.ts';

async function main() {
  const config = metaConfig();
  if (!config.enabled || !config.key) throw new MetaApiError('key_missing_or_disabled');
  const now = Date.now();
  const samples: ContextSample[] = [{ id: 'synthetic-connection-check', at: now,
    context: { batteryPercent: 80, charging: false, screenInteractive: false, network: 'online', ringer: 'normal', motion: 'unknown', location: null,
      sources: { usage: 'available', media: 'available', notifications: 'available', location: 'disabled' }, usage: null, media: null, notifications: [], sharing: 'summary' } }];
  const input = metaInput(samples, now, new LocalSituationInterpreter().evaluate(samples, now))!;
  const result = await new MetaApi(config).infer(input, now);
  console.log(JSON.stringify({ connected: true, model: config.model, data: 'synthetic_only', title: result.decision.title,
    inputTokens: result.inputTokens, outputTokens: result.outputTokens }, null, 2));
}
main().catch(error => { console.error(`Meta 連線檢查失敗：${error instanceof MetaApiError ? error.code : 'configuration_error'}`); process.exitCode = 1; });
