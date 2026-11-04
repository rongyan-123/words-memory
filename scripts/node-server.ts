/** Optional local API: Node24 built-in SQLite. Never expose this unauthenticated adapter publicly. */
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { createNodeD1, createNodeHandler } from '../src/adapters/node.ts';
import { DeepSeekPlanner } from '../src/server/provider.ts';

const host = process.env.NODE_HOST ?? '127.0.0.1';
if (!['127.0.0.1', '::1'].includes(host)) throw new Error('NODE_HOST must be a loopback address (127.0.0.1 or ::1). This adapter has no authentication.');
const port = Number(process.env.PORT ?? '8788');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
const database = createNodeD1(process.env.VOCAB_DB_PATH ?? '/tmp/vocab-wheel.sqlite');
const handler = createNodeHandler({ db: database.db, planner: new DeepSeekPlanner(process.env.DEEPSEEK_API_KEY) });
const server = createServer(async (incoming, outgoing) => {
  try {
    const expectedHost = host === '::1' ? `[::1]:${port}` : `${host}:${port}`;
    // Reject DNS-rebinding hostnames; the listening address alone is insufficient.
    if (incoming.headers.host !== expectedHost && incoming.headers.host !== `localhost:${port}`) {
      outgoing.writeHead(403, { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' }); outgoing.end('{"error":"LOOPBACK_ONLY"}'); incoming.resume(); return;
    }
    const controller = new AbortController();
    incoming.once('aborted', () => controller.abort());
    const method = incoming.method ?? 'GET';
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    const init: RequestInit & { duplex?: 'half' } = { method, headers, signal: controller.signal };
    if (method !== 'GET' && method !== 'HEAD') { init.body = Readable.toWeb(incoming) as ReadableStream<Uint8Array>; init.duplex = 'half'; }
    const response = await handler(new Request(`http://${expectedHost}${incoming.url ?? '/'}`, init));
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch { if (!outgoing.headersSent) outgoing.writeHead(500, { 'Content-Type': 'application/json' }); outgoing.end('{"error":"REQUEST_FAILED"}'); }
});
server.requestTimeout = 30_000; server.headersTimeout = 10_000; server.keepAliveTimeout = 5_000;
server.listen(port, host, () => console.info(`Local vocabulary API: http://${host === '::1' ? '[::1]' : host}:${port}/api/v1/bootstrap (loopback only)`));
let closing = false;
function close() { if (closing) return; closing = true; server.close(() => { database.close(); }); }
process.once('SIGINT', close); process.once('SIGTERM', close);
