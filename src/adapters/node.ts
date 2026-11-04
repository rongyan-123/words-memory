/** Local-only Node 24 / SQLite adapter. Production Sites uses the D1 adapter. */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ValidationError } from '../core/index.ts';
import { seedWords, seedScenes, lexiconInfo } from '../data/seed.ts';
import type { AIPlanner } from '../server/provider.ts';
import { exportDisasterBackup, DisasterExportError } from '../server/disaster-export.ts';
import { D1Repository } from '../server/repository.ts';
import { HTTPError, object, VocabularyService, type SeedData } from '../server/service.ts';

export interface NodeD1 {
  db: D1Database;
  close(): void;
}
/** Apply the same immutable schema migrations as hosted D1, only at adapter startup. */
export function createNodeD1(path = ':memory:'): NodeD1 {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    if (!existsSync(path)) {
      try { closeSync(openSync(path, 'wx', 0o600)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    }
  }
  const sqlite = new DatabaseSync(path);
  try {
    sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
    sqlite.exec('CREATE TABLE IF NOT EXISTS _node_adapter_migrations(name TEXT PRIMARY KEY, checksum TEXT NOT NULL)');
    const migrations = fileURLToPath(new URL('../../drizzle/', import.meta.url));
    for (const name of readdirSync(migrations).filter(name => /^\d+_.+\.sql$/.test(name)).sort()) {
      const source = readFileSync(join(migrations, name), 'utf8');
      const checksum = createHash('sha256').update(source).digest('hex');
      const applied = sqlite.prepare('SELECT checksum FROM _node_adapter_migrations WHERE name=?').get(name);
      if (applied) {
        if (applied.checksum !== checksum) throw new Error(`Previously applied migration changed: ${name}`);
        continue;
      }
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        sqlite.exec(source);
        sqlite.prepare('INSERT INTO _node_adapter_migrations(name,checksum) VALUES (?,?)').run(name, checksum);
        sqlite.exec('COMMIT');
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    }
  } catch (error) { sqlite.close(); throw error; }
  class Statement {
    query: string;
    args: SQLInputValue[];
    constructor(query: string, args: SQLInputValue[] = []) { this.query = query; this.args = args; }
    bind(...values: unknown[]) {
      const args = values.map(value => {
        if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' || ArrayBuffer.isView(value)) return value as SQLInputValue;
        if (value instanceof ArrayBuffer) return new Uint8Array(value);
        throw new TypeError('Unsupported SQLite bind value');
      });
      return new Statement(this.query, args);
    }
    async first(column?: string) {
      const row = sqlite.prepare(this.query).get(...this.args);
      return row ? column === undefined ? row : row[column] ?? null : null;
    }
    async all() { return this.execute(true); }
    async run() { return this.execute(false); }
    execute(read = false) {
      const started = performance.now();
      const statement = sqlite.prepare(this.query);
      const results = read ? statement.all(...this.args) : [];
      const result = read ? { changes: 0, lastInsertRowid: 0 } : statement.run(...this.args);
      return { results, success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid), duration: performance.now() - started, served_by: 'node-sqlite-local' } };
    }
  }
  const database = {
    prepare(query: string) { return new Statement(query); },
    async batch(statements: Statement[]) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const result = statements.map(statement => {
          if (!(statement instanceof Statement)) throw new TypeError('Batch statement belongs to another database');
          return statement.execute(/^\s*(SELECT|WITH|PRAGMA)\b/i.test(statement.query));
        });
        sqlite.exec('COMMIT'); return result;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return { db: database as unknown as D1Database, close() { sqlite.close(); } };
}

export interface NodeHandlerOptions {
  db: D1Database;
  planner?: AIPlanner;
  seed?: SeedData;
  now?: () => number;
  /** A trusted server-side namespace, never a request parameter or incoming header. */
  owner?: string;
}
const NO_AI: AIPlanner = { configured: false, async generate() { throw new Error('AI_NOT_CONFIGURED'); } };
const methods: Record<string, string> = { bootstrap: 'GET', plan: 'POST', review: 'POST', settings: 'PUT', export: 'GET', import: 'POST', day: 'GET', 'planning/tick':'POST', 'planning/status':'GET', 'reviews/batch':'POST', 'marks/batch':'POST', 'disaster/export':'GET' };
const MAX_BODY = 8 * 1024 * 1024;
/** Returns a Web Request handler; deliberately accepts loopback hosts only, with no CORS bypass. */
export function createNodeHandler(options: NodeHandlerOptions): (request: Request) => Promise<Response> {
  const service = new VocabularyService(new D1Repository(options.db, options.now), options.planner ?? NO_AI, options.seed ?? { words: seedWords, scenes: seedScenes, info: lexiconInfo }, options.now);
  const owner = options.owner ?? 'local-owner';
  return async function handle(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (!['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)) throw new HTTPError(403, 'LOOPBACK_ONLY', '本地适配器仅允许回环地址');
      const operation = url.pathname.startsWith('/api/v1/') ? url.pathname.slice(8) : '';
      if (!Object.hasOwn(methods,operation)) return json({ error: '接口不存在', code: 'NOT_FOUND' }, 404);
      if (request.method !== methods[operation]) return json({ error: '请求方法不支持', code: 'METHOD_NOT_ALLOWED' }, 405, { Allow: methods[operation] });
      if (request.headers.get('sec-fetch-site') === 'cross-site') throw new HTTPError(403, 'ORIGIN_FORBIDDEN', '不接受跨站请求');
      if (!['GET', 'HEAD'].includes(request.method)) {
        const origin = request.headers.get('origin');
        if (origin && origin !== url.origin) throw new HTTPError(403, 'ORIGIN_FORBIDDEN', '不接受跨站写入请求');
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) throw new HTTPError(415, 'JSON_REQUIRED', '请发送 application/json');
      }
      let result: unknown;
      switch (operation) {
        case 'disaster/export': result=await exportDisasterBackup(options.db,owner);break;
        case 'bootstrap': result = await service.bootstrap(owner); break;
        case 'day': result = await service.dayList(owner,{...(url.searchParams.has('day')?{day:url.searchParams.get('day')!}:{}),...(url.searchParams.has('date')?{date:url.searchParams.get('date')!}:{})}); break;
        case 'planning/status': result=await service.planningStatus(owner); break;
        case 'planning/tick': result = await service.planningTick(owner,await readJSON(request)); break;
        case 'marks/batch': result=await service.marksBatch(owner,await readJSON(request,64*1024)); break;
        case 'reviews/batch': result = await service.reviewBatch(owner,await readJSON(request,64*1024)); break;
        case 'plan': {
          const body = object(await readJSON(request));
          if (body.regenerate !== undefined && typeof body.regenerate !== 'boolean') throw new ValidationError('regenerate 应为布尔值');
          result = await service.plan(owner, body.regenerate === true); break;
        }
        case 'review': result = await service.review(owner, await readJSON(request)); break;
        case 'settings': result = await service.settings(owner, await readJSON(request)); break;
        case 'export': result = await service.export(owner); break;
        case 'import': result = await service.import(owner, await readJSON(request)); break;
      }
      return json(result, 200, operation === 'export' ? { 'Content-Disposition': 'attachment; filename="vocab-wheel-backup.json"' } : operation==='disaster/export'?{'Content-Disposition':'attachment; filename="vocab-wheel-disaster-backup.json"'}:{});
    } catch (error) {
      if (error instanceof DisasterExportError) return json({error:error.message,code:error.code},error.status);
      if (error instanceof HTTPError) return json({ error: error.message, code: error.code }, error.status);
      if (error instanceof ValidationError || error instanceof SyntaxError) return json({ error: error instanceof SyntaxError ? 'JSON 格式无效' : error.message, code: 'VALIDATION_ERROR' }, 400);
      return json({ error: '本地服务暂时不可用，请稍后重试。', code: 'SERVICE_UNAVAILABLE' }, 503);
    }
  };
}
function json(value: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
}
async function readJSON(request: Request,maxBody=MAX_BODY): Promise<unknown> {
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBody)) throw new HTTPError(413, 'PAYLOAD_TOO_LARGE', '单次导入不能超过 8 MB');
  if (!request.body) throw new ValidationError('请求内容为空');
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const next = await reader.read(); if (next.done) break;
    length += next.value.byteLength;
    if (length > maxBody) { await reader.cancel(); throw new HTTPError(413, 'PAYLOAD_TOO_LARGE', '单次导入不能超过 8 MB'); }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
