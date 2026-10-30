import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { CareStore } from './store.ts';
import { demand, object, Problem } from './domain.ts';
import { isLang } from './lang.ts';
import type { Lang } from './lang.ts';
import { metaConfig } from './meta-api.ts';
import { MetaSecretary } from './meta-secretary.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const bearer = (req: IncomingMessage) => /^Bearer ([A-Za-z0-9_-]+)$/.exec(req.headers.authorization || '')?.[1];
const cookie = (req: IncomingMessage) => /(?:^|;\s*)picocare_session=([A-Za-z0-9_-]+)/.exec(req.headers.cookie || '')?.[1];

async function body(req: IncomingMessage): Promise<unknown> {
  demand((req.headers['content-type'] || '').split(';')[0] === 'application/json', '請使用 application/json', 415);
  let size = 0; const chunks: Buffer[] = [];
  for await (const chunk of req) { size += chunk.length; demand(size <= 32768, '請求內容過大', 413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Problem(400, 'JSON 格式不正確'); }
}
function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
}
export function makeServer(store: CareStore, options: { allowDemo?: boolean; schedulerIntervalMs?: number } = {}) {
  const server = createServer(async (req, res) => {
    try {
      const host = req.headers.host || '';
      demand(/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host), '這個開發服務只接受本機連線', 403);
      if (req.headers.origin) demand(req.headers.origin === `http://${host}`, '來源不符', 403);
      const url = new URL(req.url || '/', `http://${host}`), path = url.pathname, method = req.method;
      if (method === 'GET' && path === '/health') return json(res, 200, { service: 'PicoCare', version: '0.1.0', meta: store.metaStatus() });
      if (method === 'POST' && path === '/api/workspaces') {
        const created = store.createWorkspace(await body(req));
        res.setHeader('Set-Cookie', `picocare_session=${created.session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);
        return json(res, 201, { workspace: created.identity });
      }
      if (method === 'POST' && path === '/api/device/enroll') return json(res, 201, store.enroll(await body(req)));
      if (method === 'POST' && path === '/api/device/self-enroll') return json(res, 201, store.selfEnroll(await body(req)));
      if (path.startsWith('/api/device/')) {
        if (method === 'POST' && path === '/api/device/events') return json(res, 202, store.ingest(bearer(req), await body(req)));
        if (method === 'GET' && path === '/api/device/status') return json(res, 200, store.deviceStatus(bearer(req)));
        if (method === 'POST' && path === '/api/device/plan') return json(res, 200, store.selfPlan(bearer(req), await body(req)));
        throw new Problem(404, '找不到這個手機 API');
      }
      if ((method === 'GET' || method === 'POST') && path === '/api/lang') {
        try { store.identity(cookie(req)); } catch { store.device(bearer(req)); }
        if (method === 'GET') return json(res, 200, { lang: store.lang() });
        const v = object(await body(req));
        demand(isLang(v.lang), 'lang must be en or zh');
        const lang = v.lang as Lang;
        if (lang !== store.lang()) { store.setLang(lang); store.backfillLang(lang); }
        return json(res, 200, { lang: store.lang() });
      }
      if (path.startsWith('/api/')) {
        const identity = store.identity(cookie(req));
        if (method === 'GET' && path === '/api/session') return json(res, 200, { workspace: identity, demoEnabled: !!options.allowDemo });
        if (method === 'GET' && path === '/api/people') return json(res, 200, store.list(identity));
        if (method === 'GET' && path === '/api/alerts') return json(res, 200, { alerts: store.flow.alerts(identity) });
        const alertMatch = /^\/api\/alerts\/([a-f0-9-]{36})\/read$/.exec(path);
        if (method === 'POST' && alertMatch) { await body(req); return json(res, 200, store.flow.read(identity, alertMatch[1])); }
        const secretaryMatch = /^\/api\/people\/([a-f0-9-]{36})\/secretary\/resolve$/.exec(path);
        if (method === 'POST' && secretaryMatch) return json(res, 200, store.secretary.resolve(identity, secretaryMatch[1], await body(req)));
        if (method === 'POST' && path === '/api/pairings') return json(res, 201, store.createPairing(identity, await body(req)));
        if (method === 'POST' && path === '/api/demo') { demand(options.allowDemo, '示範模式未啟用', 404); return json(res, 201, store.seedDemo(identity)); }
        const match = /^\/api\/people\/([a-f0-9-]{36})(?:\/(reminders|contacts|plan))?$/.exec(path);
        if (match && method === 'GET' && !match[2]) return json(res, 200, store.detail(identity, match[1]));
        if (match && method === 'POST' && match[2] === 'reminders') { await body(req); return json(res, 201, store.requestCheckin(identity, match[1])); }
        if (match && method === 'POST' && match[2] === 'contacts') return json(res, 201, store.contact(identity, match[1], await body(req)));
        if (match && method === 'POST' && match[2] === 'plan') return json(res, 200, store.flow.setPlan(identity, match[1], await body(req)));
        throw new Problem(404, '找不到這個功能');
      }
      demand(method === 'GET', '找不到這個頁面', 404);
      const assets: Record<string, [string, string]> = {
        '/': ['web/index.html', 'text/html'], '/style.css': ['web/style.css', 'text/css'], '/app.js': ['.build/web/app.js', 'text/javascript']
      };
      const asset = assets[path]; demand(asset, '找不到這個頁面', 404);
      const data = await readFile(join(root, asset[0]));
      res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8`, 'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
      res.end(data);
    } catch (error) {
      const expected = error instanceof Problem;
      if (!expected) console.error('Request failed:', error instanceof Error ? error.name : 'unknown');
      if (!res.headersSent) json(res, expected ? error.status : 500, { error: expected ? error.message : '服務暫時無法處理這個請求' });
      else res.end();
    }
  });
  const tick = () => { try { store.flow.tick(); void store.secretary.model?.tick().catch(() => console.error('Meta scheduler failed')); void store.secretary.model?.weeklyTick().catch(() => console.error('Meta weekly scheduler failed')); } catch (error) { console.error('Care scheduler failed:', error instanceof Error ? error.name : 'unknown'); } };
  let timer: ReturnType<typeof setInterval> | undefined;
  server.on('listening', () => { tick(); timer = setInterval(tick, options.schedulerIntervalMs ?? 5000); timer.unref(); });
  server.on('close', () => { if (timer) clearInterval(timer); store.secretary.model?.close(); });
  return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const store = new CareStore(process.env.PICOCARE_DB || join(root, '.local/care.sqlite'));
  store.secretary.model = new MetaSecretary(store, metaConfig());
  store.metaElseReviewer = (args) => store.secretary.model!.reviewElse(args);
  const server = makeServer(store, { allowDemo: process.argv.includes('--demo') });
  const port = Number(process.env.PORT || 4317);
  server.listen(port, '127.0.0.1', () => console.log(`PicoCare: http://127.0.0.1:${port} · Meta ${store.metaStatus().status}`));
  const stop = () => server.close(() => { store.close(); process.exit(0); });
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
