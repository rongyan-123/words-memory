import { DisasterExportError, exportDisasterBackup } from './disaster-export.ts';
import { env } from 'cloudflare:workers';
import { ValidationError } from '../core/index.ts';
import { seedWords, seedScenes, lexiconInfo } from '../data/seed.ts';
import { DeepSeekPlanner } from './provider.ts';
import { D1Repository } from './repository.ts';
import { HTTPError, object, VocabularyService } from './service.ts';

/**
 * SINGLE OWNER PRIVATE SITE ONLY. Sites dispatch enforces owner authentication
 * for browsers and validates owner-issued service access before this code runs.
 * There is deliberately no client-controlled identity header/query bypass here.
 * Never change this Site to public/shared without replacing this boundary with
 * per-request authenticated identity + per-record ownership authorization.
 */
const OWNER_NAMESPACE = 'site-owner';
type Operation = 'bootstrap' | 'plan' | 'review' | 'settings' | 'export' | 'import' | 'day' | 'planningTick' | 'reviewBatch' | 'planningStatus' | 'marksBatch' | 'disasterExport';
const methods: Record<Operation, string> = { bootstrap: 'GET', plan: 'POST', review: 'POST', settings: 'PUT', export: 'GET', import: 'POST', day: 'GET', planningTick: 'POST', reviewBatch: 'POST', planningStatus: 'GET', marksBatch: 'POST', disasterExport:'GET' };
const LIMITS = { plan: 2 * 1024, review: 2 * 1024, settings: 4 * 1024, import: 8 * 1024 * 1024, planningTick: 2 * 1024, reviewBatch: 64 * 1024, marksBatch: 64 * 1024 };
export async function handle(operation: Operation, request: Request): Promise<Response> {
  try {
    if (request.method !== methods[operation]) throw new HTTPError(405, 'METHOD_NOT_ALLOWED', '请求方法不支持');
    if (!['GET','HEAD'].includes(request.method)) {
      const origin = request.headers.get('origin');
      if (origin && origin !== new URL(request.url).origin) throw new HTTPError(403, 'ORIGIN_FORBIDDEN', '不接受跨站写入请求');
      const fetchSite = request.headers.get('sec-fetch-site');
      if (fetchSite === 'cross-site') throw new HTTPError(403, 'ORIGIN_FORBIDDEN', '不接受跨站写入请求');
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new HTTPError(415, 'JSON_REQUIRED', '请发送 application/json');
    }
    const runtime = env as unknown as { DB?: D1Database; DEEPSEEK_API_KEY?: string };
    if (!runtime.DB) throw new HTTPError(503, 'STORAGE_UNAVAILABLE', '持久化数据库尚未就绪，请稍后刷新。');
    // Disaster capture is read-only and must not initialize state or touch AI credentials.
    if(operation==='disasterExport') return json(await exportDisasterBackup(runtime.DB,OWNER_NAMESPACE),200,{'Content-Disposition':'attachment; filename="vocab-wheel-disaster-backup.json"'});
    const service = new VocabularyService(new D1Repository(runtime.DB), new DeepSeekPlanner(runtime.DEEPSEEK_API_KEY), { words: seedWords, scenes: seedScenes, info: lexiconInfo });
    const owner = OWNER_NAMESPACE;
    let result: unknown;
    switch (operation) {
      case 'bootstrap': result = await service.bootstrap(owner); break;
      case 'day': { const url=new URL(request.url); result=await service.dayList(owner,{...(url.searchParams.has('day')?{day:url.searchParams.get('day')!}:{}),...(url.searchParams.has('date')?{date:url.searchParams.get('date')!}:{})}); break; }
      case 'planningStatus': result=await service.planningStatus(owner); break;
      case 'planningTick': result=await service.planningTick(owner,await readJSON(request,LIMITS.planningTick)); break;
      case 'marksBatch': result=await service.marksBatch(owner,await readJSON(request,LIMITS.marksBatch)); break;
      case 'reviewBatch': result=await service.reviewBatch(owner,await readJSON(request,LIMITS.reviewBatch)); break;
      case 'plan': {
        const body = object(await readJSON(request, LIMITS.plan));
        if (body.regenerate !== undefined && typeof body.regenerate !== 'boolean') throw new ValidationError('regenerate 应为布尔值');
        result = await service.plan(owner, body.regenerate === true); break;
      }
      case 'review': result = await service.review(owner, await readJSON(request, LIMITS.review)); break;
      case 'settings': result = await service.settings(owner, await readJSON(request, LIMITS.settings)); break;
      case 'export': result = await service.export(owner); break;
      case 'import': result = await service.import(owner, await readJSON(request, LIMITS.import)); break;
    }
    return json(result, 200, operation === 'export' ? { 'Content-Disposition': 'attachment; filename="vocab-wheel-backup.json"' } : {});
  } catch (error) {
    if (error instanceof DisasterExportError) return json({error:error.message,code:error.code},error.status);
    if (error instanceof HTTPError) return json({ error: error.message, code: error.code }, error.status);
    if (error instanceof ValidationError || error instanceof SyntaxError) return json({ error: error instanceof SyntaxError ? 'JSON 格式无效' : error.message, code: 'VALIDATION_ERROR' }, 400);
    // Do not serialize upstream responses, request bodies, secrets, or stack traces.
    console.error('[vocab-wheel] API request failed:', operation);
    return json({ error: '服务暂时不可用。你的已保存进度仍在，请稍后重试。', code: 'SERVICE_UNAVAILABLE' }, 503);
  }
}
function json(value: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
}
async function readJSON(request: Request, maxBody: number): Promise<unknown> {
  const size = request.headers.get('content-length');
  if (size && Number(size) > maxBody) throw new HTTPError(413, 'PAYLOAD_TOO_LARGE', maxBody >= 1024 * 1024 ? '整包导入不能超过 8 MiB' : '请求内容过大');
  if (!request.body) throw new ValidationError('请求内容为空');
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const next = await reader.read(); if (next.done) break;
    length += next.value.byteLength;
    if (length > maxBody) { await reader.cancel(); throw new HTTPError(413, 'PAYLOAD_TOO_LARGE', maxBody >= 1024 * 1024 ? '整包导入不能超过 8 MiB' : '请求内容过大'); }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
