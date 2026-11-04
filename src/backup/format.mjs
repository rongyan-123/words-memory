/* Portable disaster-backup validation. No Node imports; works in Workers and Node24. */
export const BACKUP_FORMAT = "vocab-wheel-disaster-backup";
export const MAX_BACKUP_BYTES = 16 * 1024 * 1024;
export const SUPPORTED_MIGRATIONS = Object.freeze([{"name":"0000_normal_cassandra_nova.sql","sha256":"a2dcb675ebbe927504c12302a2b80b1973084e4f0f9398285c92e84759d9550a"},{"name":"0001_aromatic_tiger_shark.sql","sha256":"c2bf9e365d0b2fea029ba052c42851459363d580c0d11547414306bd18adead3"},{"name":"0002_loose_energizer.sql","sha256":"e6c8da58091787d7e0384b680a85ca3c7638be7eb689c9be780a485e76be7193"}]);
export const EXPECTED_SEED_SHA256 = "8b6af3402a70e4b69d324593e92546d72dfe8de5aa3964568bfc56d69728b31e";
export const TABLE_DEFINITIONS = Object.freeze({"custom_lexicon":{"columns":["owner_id","record_id","kind","payload_json"],"primaryKey":["owner_id","record_id","kind"],"schemaSql":"CREATE TABLE `custom_lexicon` (\n\t`owner_id` text NOT NULL,\n\t`record_id` text NOT NULL,\n\t`kind` text NOT NULL,\n\t`payload_json` text NOT NULL,\n\tPRIMARY KEY(`owner_id`, `record_id`, `kind`)\n)","types":[{"name":"owner_id","type":"TEXT","notnull":true},{"name":"record_id","type":"TEXT","notnull":true},{"name":"kind","type":"TEXT","notnull":true},{"name":"payload_json","type":"TEXT","notnull":true}]},"daily_plans":{"columns":["owner_id","day","plan_json","generations","claim_token","locked_until","updated_at"],"primaryKey":["owner_id","day"],"schemaSql":"CREATE TABLE `daily_plans` (\n\t`owner_id` text NOT NULL,\n\t`day` text NOT NULL,\n\t`plan_json` text,\n\t`generations` integer DEFAULT 0 NOT NULL,\n\t`claim_token` text,\n\t`locked_until` integer,\n\t`updated_at` integer DEFAULT 0 NOT NULL,\n\tPRIMARY KEY(`owner_id`, `day`)\n)","types":[{"name":"owner_id","type":"TEXT","notnull":true},{"name":"day","type":"TEXT","notnull":true},{"name":"plan_json","type":"TEXT","notnull":false},{"name":"generations","type":"INTEGER","notnull":true},{"name":"claim_token","type":"TEXT","notnull":false},{"name":"locked_until","type":"INTEGER","notnull":false},{"name":"updated_at","type":"INTEGER","notnull":true}]},"mark_operations":{"columns":["owner_id","op_id","word_id","delta","claim_token","created_at"],"primaryKey":["owner_id","op_id"],"schemaSql":"CREATE TABLE `mark_operations` (\n\t`owner_id` text NOT NULL,\n\t`op_id` text NOT NULL,\n\t`word_id` text NOT NULL,\n\t`delta` integer NOT NULL,\n\t`claim_token` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\tPRIMARY KEY(`owner_id`, `op_id`),\n\tCONSTRAINT \"mark_operations_delta_valid\" CHECK(\"mark_operations\".\"delta\" IN (-1, 1))\n)","types":[{"name":"owner_id","type":"TEXT","notnull":true},{"name":"op_id","type":"TEXT","notnull":true},{"name":"word_id","type":"TEXT","notnull":true},{"name":"delta","type":"INTEGER","notnull":true},{"name":"claim_token","type":"TEXT","notnull":true},{"name":"created_at","type":"INTEGER","notnull":true}]},"plan_config":{"columns":["owner_id","start_date","horizon_days","page_size","lease_token","lease_until","retry_after","created_at","updated_at"],"primaryKey":["owner_id"],"schemaSql":"CREATE TABLE `plan_config` (\n\t`owner_id` text PRIMARY KEY NOT NULL,\n\t`start_date` text NOT NULL,\n\t`horizon_days` integer DEFAULT 10 NOT NULL,\n\t`page_size` integer DEFAULT 0 NOT NULL,\n\t`lease_token` text,\n\t`lease_until` integer,\n\t`retry_after` integer DEFAULT 0 NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL\n)","types":[{"name":"owner_id","type":"TEXT","notnull":true},{"name":"start_date","type":"TEXT","notnull":true},{"name":"horizon_days","type":"INTEGER","notnull":true},{"name":"page_size","type":"INTEGER","notnull":true},{"name":"lease_token","type":"TEXT","notnull":false},{"name":"lease_until","type":"INTEGER","notnull":false},{"name":"retry_after","type":"INTEGER","notnull":true},{"name":"created_at","type":"INTEGER","notnull":true},{"name":"updated_at","type":"INTEGER","notnull":true}]},"reserved_words":{"columns":["owner_id","word_id","day"],"primaryKey":["owner_id","word_id"],"schemaSql":"CREATE TABLE `reserved_words` (\n\t`owner_id` text NOT NULL,\n\t`word_id` text NOT NULL,\n\t`day` text NOT NULL,\n\tPRIMARY KEY(`owner_id`, `word_id`)\n)","types":[{"name":"owner_id","type":"TEXT","notnull":true},{"name":"word_id","type":"TEXT","notnull":true},{"name":"day","type":"TEXT","notnull":true}]},"review_batches":{"columns":["owner_id","batch_id","payload_hash","claim_token","result_json","created_at"],"primaryKey":["owner_id","batch_id"],"schemaSql":"CREATE TABLE `review_batches` (\n\t`owner_id` text NOT NULL,\n\t`batch_id` text NOT NULL,\n\t`payload_hash` text NOT NULL,\n\t`claim_token` text NOT NULL,\n\t`result_json` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\tPRIMARY KEY(`owner_id`, `batch_id`)\n)","types":[{"name":"owner_id","type":"TEXT","notnull":true},{"name":"batch_id","type":"TEXT","notnull":true},{"name":"payload_hash","type":"TEXT","notnull":true},{"name":"claim_token","type":"TEXT","notnull":true},{"name":"result_json","type":"TEXT","notnull":true},{"name":"created_at","type":"INTEGER","notnull":true}]},"review_events":{"columns":["owner_id","event_id","word_id","grade","claim_token","result_json","created_at"],"primaryKey":["owner_id","event_id"],"schemaSql":"CREATE TABLE `review_events` (\n\t`owner_id` text NOT NULL,\n\t`event_id` text NOT NULL,\n\t`word_id` text NOT NULL,\n\t`grade` text NOT NULL,\n\t`claim_token` text NOT NULL,\n\t`result_json` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\tPRIMARY KEY(`owner_id`, `event_id`)\n)","types":[{"name":"owner_id","type":"TEXT","notnull":true},{"name":"event_id","type":"TEXT","notnull":true},{"name":"word_id","type":"TEXT","notnull":true},{"name":"grade","type":"TEXT","notnull":true},{"name":"claim_token","type":"TEXT","notnull":true},{"name":"result_json","type":"TEXT","notnull":true},{"name":"created_at","type":"INTEGER","notnull":true}]},"scheduled_days":{"columns":["owner_id","day","day_index","plan_json","completed_at","created_at"],"primaryKey":["owner_id","day"],"schemaSql":"CREATE TABLE `scheduled_days` (\n\t`owner_id` text NOT NULL,\n\t`day` text NOT NULL,\n\t`day_index` integer NOT NULL,\n\t`plan_json` text NOT NULL,\n\t`completed_at` integer,\n\t`created_at` integer NOT NULL,\n\tPRIMARY KEY(`owner_id`, `day`)\n)","types":[{"name":"owner_id","type":"TEXT","notnull":true},{"name":"day","type":"TEXT","notnull":true},{"name":"day_index","type":"INTEGER","notnull":true},{"name":"plan_json","type":"TEXT","notnull":true},{"name":"completed_at","type":"INTEGER","notnull":false},{"name":"created_at","type":"INTEGER","notnull":true}]},"user_state":{"columns":["owner_id","settings_json","lexicon_json","updated_at"],"primaryKey":["owner_id"],"schemaSql":"CREATE TABLE `user_state` (\n\t`owner_id` text PRIMARY KEY NOT NULL,\n\t`settings_json` text NOT NULL,\n\t`lexicon_json` text DEFAULT '{\"words\":[],\"scenes\":[]}' NOT NULL,\n\t`updated_at` integer NOT NULL\n)","types":[{"name":"owner_id","type":"TEXT","notnull":true},{"name":"settings_json","type":"TEXT","notnull":true},{"name":"lexicon_json","type":"TEXT","notnull":true},{"name":"updated_at","type":"INTEGER","notnull":true}]},"word_marks":{"columns":["owner_id","word_id","hard_count","revision","updated_at"],"primaryKey":["owner_id","word_id"],"schemaSql":"CREATE TABLE `word_marks` (\n\t`owner_id` text NOT NULL,\n\t`word_id` text NOT NULL,\n\t`hard_count` integer DEFAULT 0 NOT NULL,\n\t`revision` integer DEFAULT 1 NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tPRIMARY KEY(`owner_id`, `word_id`),\n\tCONSTRAINT \"word_marks_count_safe\" CHECK(typeof(\"word_marks\".\"hard_count\") = 'integer' AND \"word_marks\".\"hard_count\" >= 0 AND \"word_marks\".\"hard_count\" <= 9007199254740991),\n\tCONSTRAINT \"word_marks_revision_safe\" CHECK(typeof(\"word_marks\".\"revision\") = 'integer' AND \"word_marks\".\"revision\" >= 1 AND \"word_marks\".\"revision\" <= 9007199254740991)\n)","types":[{"name":"owner_id","type":"TEXT","notnull":true},{"name":"word_id","type":"TEXT","notnull":true},{"name":"hard_count","type":"INTEGER","notnull":true},{"name":"revision","type":"INTEGER","notnull":true},{"name":"updated_at","type":"INTEGER","notnull":true}]},"word_progress":{"columns":["owner_id","word_id","progress_json","revision"],"primaryKey":["owner_id","word_id"],"schemaSql":"CREATE TABLE `word_progress` (\n\t`owner_id` text NOT NULL,\n\t`word_id` text NOT NULL,\n\t`progress_json` text NOT NULL,\n\t`revision` integer DEFAULT 1 NOT NULL,\n\tPRIMARY KEY(`owner_id`, `word_id`)\n)","types":[{"name":"owner_id","type":"TEXT","notnull":true},{"name":"word_id","type":"TEXT","notnull":true},{"name":"progress_json","type":"TEXT","notnull":true},{"name":"revision","type":"INTEGER","notnull":true}]}});
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/;
const OP_ID = /^[A-Za-z0-9_-]{8,100}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TABLE_NAMES = Object.keys(TABLE_DEFINITIONS).sort();
export class BackupValidationError extends Error {
  constructor(code, detail = '') { super(detail ? `${code}: ${detail}` : code); this.name = 'BackupValidationError'; this.code = code; }
}
function fail(code, detail = '') { throw new BackupValidationError(code, detail); }
function assert(condition, code, detail = '') { if (!condition) fail(code, detail); }
function obj(value, label = 'object') { assert(value !== null && typeof value === 'object' && !Array.isArray(value), 'INVALID_OBJECT', label); return value; }
function keys(value, allowed, required = allowed, label = 'object') {
  obj(value, label); assert(Object.keys(value).every(key => allowed.includes(key)) && required.every(key => Object.hasOwn(value, key)), 'UNEXPECTED_FIELDS', label);
}
function int(value, min = 0, max = Number.MAX_SAFE_INTEGER) { return Number.isSafeInteger(value) && value >= min && value <= max; }
function str(value, max = 1000, min = 0) { return typeof value === 'string' && value.length >= min && value.length <= max; }
function date(value) { return typeof value === 'string' && DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value; }
function iso(value) { return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value; }
function shanghai(time) { const d = new Date(time + 8 * 3600_000); return d.toISOString().slice(0, 10); }
function addDay(day, count) { return new Date(Date.parse(`${day}T00:00:00Z`) + count * 86400_000).toISOString().slice(0,10); }
function grade(value) { return ['remembered','fuzzy','forgot'].includes(value); }
function normalizeSQL(value) { return value.replace(/[`"\s;]/g, '').toLowerCase(); }
function same(a,b) { return canonicalize(a) === canonicalize(b); }
function json(value, label) { assert(str(value, 2 * 1024 * 1024), 'INVALID_JSON_COLUMN', label); try { return JSON.parse(value); } catch { return fail('INVALID_JSON_COLUMN', label); } }
function unique(values) { return new Set(values).size === values.length; }
function textArray(values, max = 20000) { return Array.isArray(values) && values.length <= max && values.every(value => typeof value === 'string') && unique(values); }
function safeToken(value, nullable = false) { return nullable && value === null || str(value, 200, 1); }
export function canonicalize(value, depth = 0) {
  assert(depth < 100, 'EXCESSIVE_DEPTH');
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') { assert(Number.isFinite(value), 'NONFINITE_NUMBER'); return JSON.stringify(value); }
  if (Array.isArray(value)) return `[${value.map(item => canonicalize(item, depth + 1)).join(',')}]`;
  obj(value); return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key], depth + 1)}`).join(',')}}`;
}
export async function sha256(value) {
  const input = typeof value === 'string' ? value : canonicalize(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function sha256Value(value) { return sha256(canonicalize(value)); }
function jsonSize(value, depth = 0) {
  assert(depth < 100, 'EXCESSIVE_DEPTH');
  if (value === null || typeof value !== 'object') return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (Array.isArray(value)) return 2 + Math.max(0,value.length-1) + value.reduce((sum,item) => sum + jsonSize(item,depth+1),0);
  return 2 + Math.max(0,Object.keys(value).length-1) + Object.entries(value).reduce((sum,[key,item]) => sum + new TextEncoder().encode(JSON.stringify(key)).byteLength + 1 + jsonSize(item,depth+1),0);
}
function noSecrets(value, depth = 0) {
  assert(depth < 100, 'EXCESSIVE_DEPTH');
  if (value === null || typeof value !== 'object') return;
  for (const [key,item] of Object.entries(value)) {
    assert(!/^(?:api[_-]?key|deepseek_api_key|openai_api_key|authorization|access[_-]?token|refresh[_-]?token|private[_-]?key|password|secret)$/i.test(key), 'SECRET_FIELD_FORBIDDEN');
    if (item !== null && typeof item === 'object') noSecrets(item, depth+1);
  }
}
function validateWord(word) {
  keys(word,['id','term','meaning','phonetic','partOfSpeech','example','exampleZh','tags','sceneIds','source'],['id','term','meaning','tags','sceneIds'],'word');
  assert(ID.test(word.id) && str(word.term,100,1) && str(word.meaning,500,1) && textArray(word.tags,20) && word.tags.every(t=>str(t,100,1)) && textArray(word.sceneIds,20) && word.sceneIds.every(id=>ID.test(id)), 'INVALID_WORD');
  for (const [key,max] of [['phonetic',100],['partOfSpeech',50],['example',1000],['exampleZh',1000],['source',500]]) if (word[key] !== undefined) assert(str(word[key],max),'INVALID_WORD',key);
}
function validateScene(scene, words) {
  keys(scene,['id','title','description','wordIds','task'],['id','title','description','wordIds'],'scene');
  assert(ID.test(scene.id) && str(scene.title,100,1) && str(scene.description,1000) && textArray(scene.wordIds,10000) && scene.wordIds.every(id=>words.has(id)), 'INVALID_SCENE');
  if (scene.task !== undefined) assert(str(scene.task,1000),'INVALID_SCENE');
}
function validateSettings(settings) {
  keys(settings,['goalDate','dailyMinutes','newWordSeconds','reviewWordSeconds','timezone','horizonDays','pageSize'],['goalDate','dailyMinutes','newWordSeconds','reviewWordSeconds','timezone'],'settings');
  assert(date(settings.goalDate) && settings.timezone==='Asia/Shanghai' && typeof settings.dailyMinutes==='number' && settings.dailyMinutes>=5 && settings.dailyMinutes<=180 && typeof settings.newWordSeconds==='number' && settings.newWordSeconds>=10 && settings.newWordSeconds<=180 && typeof settings.reviewWordSeconds==='number' && settings.reviewWordSeconds>=3 && settings.reviewWordSeconds<=60,'INVALID_SETTINGS');
  if (settings.horizonDays !== undefined) assert(int(settings.horizonDays,1,365),'INVALID_SETTINGS');
  if (settings.pageSize !== undefined) assert(int(settings.pageSize,0,200),'INVALID_SETTINGS');
}
function validateProgress(p, known, today) {
  keys(p,['wordId','firstLearnedOn','stage','nextDueOn','lastReviewedOn','lastExposureOn','exposuresToday','lastGrade']);
  assert(known.has(p.wordId) && int(p.stage,0,3) && int(p.exposuresToday,0,3) && (p.lastGrade===null || grade(p.lastGrade)),'INVALID_PROGRESS',p.wordId);
  for (const key of ['firstLearnedOn','nextDueOn','lastReviewedOn','lastExposureOn']) assert(p[key]===null || date(p[key]),'INVALID_PROGRESS_DATE',key);
  if (p.firstLearnedOn===null) { assert(p.stage===0 && p.nextDueOn===null && p.lastReviewedOn===null && p.lastExposureOn===null && p.exposuresToday===0 && p.lastGrade===null,'RESET_PROGRESS_WITH_FIELDS'); return; }
  assert(p.firstLearnedOn<=today && p.lastReviewedOn!==null && p.lastExposureOn!==null && p.lastGrade!==null && p.lastReviewedOn>=p.firstLearnedOn && p.lastExposureOn>=p.lastReviewedOn && p.lastExposureOn<=today,'INVALID_PROGRESS_ORDER',p.wordId);
  assert(p.stage===3 ? p.nextDueOn===null && p.lastGrade==='remembered' : p.nextDueOn!==null && p.nextDueOn>p.firstLearnedOn && p.nextDueOn>p.lastExposureOn,'INVALID_PROGRESS_STAGE',p.wordId);
}
function validatePlan(plan, known, scenes, expectedDate) {
  const allowed=['date','source','title','rationale','notice','groups','wordIds','aiUsage','aiModel','aiReasoning','aiFailure'];
  keys(plan,allowed,['date','source','title','rationale','notice','groups','wordIds'],'plan');
  assert(date(plan.date) && (!expectedDate || plan.date===expectedDate) && ['ai','curated'].includes(plan.source) && str(plan.title,200,1) && str(plan.rationale,2000) && str(plan.notice,3000) && textArray(plan.wordIds,10000) && plan.wordIds.every(id=>known.has(id)) && Array.isArray(plan.groups) && plan.groups.length<=100,'INVALID_PLAN');
  const ids=[];
  for (const group of plan.groups) {
    keys(group,['sceneId','title','task','wordIds']);
    assert((scenes.has(group.sceneId)||group.sceneId==='imported') && str(group.title,200,1) && str(group.task,2000) && textArray(group.wordIds,10000) && group.wordIds.length>0 && group.wordIds.every(id=>known.has(id)),'INVALID_PLAN_GROUP');
    if(group.sceneId!=='imported') assert(group.wordIds.every(id=>scenes.get(group.sceneId).wordIds.includes(id)),'PLAN_SCENE_MISMATCH');
    ids.push(...group.wordIds);
  }
  assert(unique(ids) && same(ids,plan.wordIds),'PLAN_WORD_LIST_MISMATCH');
  if(plan.aiUsage!==undefined) { keys(plan.aiUsage,['promptTokens','completionTokens','totalTokens']); assert(Object.values(plan.aiUsage).every(v=>int(v)),'INVALID_PLAN_USAGE'); }
  if(plan.aiModel!==undefined) assert(plan.aiModel==='deepseek-flash','INVALID_PLAN_MODEL');
  if(plan.aiReasoning!==undefined) assert(plan.aiReasoning==='low','INVALID_PLAN_REASONING');
  if(plan.aiFailure!==undefined) {
    keys(plan.aiFailure,['code','httpStatus','finishReason','contentChars','completionTokens','reasoningTokens','validationCode'],['code'],'aiFailure');
    assert(str(plan.aiFailure.code,100,1),'INVALID_PLAN_FAILURE');
    for(const key of ['httpStatus','contentChars','completionTokens','reasoningTokens']) if(plan.aiFailure[key]!==undefined) assert(int(plan.aiFailure[key]),'INVALID_PLAN_FAILURE');
    for(const key of ['finishReason','validationCode']) if(plan.aiFailure[key]!==undefined) assert(str(plan.aiFailure[key],200),'INVALID_PLAN_FAILURE');
  }
  return plan;
}
function validateEventResult(result, known, today) {
  keys(result,['wordId','grade','progress','applied','reason']);
  assert(known.has(result.wordId) && grade(result.grade) && typeof result.applied==='boolean' && ['applied','daily_limit'].includes(result.reason) && result.progress?.wordId===result.wordId,'INVALID_EVENT_RESULT');
  validateProgress(result.progress,known,today);
  assert(result.applied ? result.reason==='applied' && result.progress.lastGrade===result.grade && result.progress.exposuresToday>=1 : result.reason==='daily_limit' && result.progress.exposuresToday===3,'INVALID_EVENT_RESULT_REASON');
  return result;
}
function contentManifest(snapshot) {
  const {exportedAt,contentSha256,...root}=snapshot;
  const {seed,migrations,...application}=root.application;
  return {...root,application:{...application,seed:{sha256:seed.sha256},migrations:migrations.map(({name,sha256})=>({name,sha256}))},tables:Object.fromEntries(TABLE_NAMES.map(name=>[name,{rowCount:root.tables[name].rowCount,sha256:root.tables[name].sha256}]))};
}
function tableContent(table) { return {columns:table.columns,primaryKey:table.primaryKey,schemaSql:table.schemaSql,rows:table.rows,rowCount:table.rowCount}; }
function pk(row, definition) { return JSON.stringify(definition.primaryKey.map(key=>row[key])); }
async function inspectSnapshot(snapshot, verifyHashes = true) {
  keys(snapshot,['format','version','exportedAt','complete','scope','application','tables','summary','contentSha256'],['format','version','exportedAt','complete','scope','application','tables'],'snapshot');
  assert(snapshot.format===BACKUP_FORMAT && snapshot.version===1 && snapshot.complete===true && iso(snapshot.exportedAt),'INVALID_HEADER');
  keys(snapshot.scope,['ownerId']); assert(snapshot.scope.ownerId==='site-owner','OWNER_SCOPE_MISMATCH');
  const app=snapshot.application;
  keys(app,['name','packageVersion','sourceTreeSha256','baseCommit','schemaVersion','migrations','seed']);
  assert(app.name==='vocab-wheel' && str(app.packageVersion,80,1) && HASH.test(app.sourceTreeSha256) && /^[a-f0-9]{40}$/.test(app.baseCommit) && app.schemaVersion===3,'INVALID_APPLICATION_METADATA');
  assert(Array.isArray(app.migrations) && app.migrations.length===SUPPORTED_MIGRATIONS.length,'MIGRATION_SET_MISMATCH');
  for(let index=0;index<SUPPORTED_MIGRATIONS.length;index++) {
    const migration=app.migrations[index],expected=SUPPORTED_MIGRATIONS[index]; keys(migration,['name','sha256','sql']);
    assert(migration.name===expected.name && migration.sha256===expected.sha256 && str(migration.sql,100000,1) && await sha256(migration.sql)===expected.sha256,'UNSUPPORTED_MIGRATION',expected.name);
  }
  keys(app.seed,['words','scenes','info','sha256'],['words','scenes','info'],'seed');
  assert(Array.isArray(app.seed.words) && app.seed.words.length>0 && app.seed.words.length<=10000 && Array.isArray(app.seed.scenes) && app.seed.scenes.length<=1000,'INVALID_SEED');
  const seedDigest=await sha256Value({words:app.seed.words,scenes:app.seed.scenes,info:app.seed.info});
  assert(seedDigest===EXPECTED_SEED_SHA256,'UNSUPPORTED_SEED_CONTENT');
  if(verifyHashes || app.seed.sha256!==undefined) assert(app.seed.sha256===seedDigest,'SEED_CHECKSUM_MISMATCH');
  const words=new Map(),scenes=new Map();
  for(const word of app.seed.words) {validateWord(word);assert(!words.has(word.id),'DUPLICATE_WORD_ID');words.set(word.id,word);}
  for(const scene of app.seed.scenes) {validateScene(scene,words);assert(!scenes.has(scene.id),'DUPLICATE_SCENE_ID');scenes.set(scene.id,scene);}
  obj(app.seed.info,'seed.info');
  keys(snapshot.tables,TABLE_NAMES,TABLE_NAMES,'tables');
  const parsed={}; let totalRows=0;
  for(const name of TABLE_NAMES) {
    const table=snapshot.tables[name],definition=TABLE_DEFINITIONS[name];
    keys(table,['columns','primaryKey','schemaSql','rows','rowCount','sha256'],['columns','primaryKey','schemaSql','rows','rowCount'],name);
    assert(same(table.columns,definition.columns) && same(table.primaryKey,definition.primaryKey) && str(table.schemaSql,20000,1) && normalizeSQL(table.schemaSql)===normalizeSQL(definition.schemaSql),'TABLE_SCHEMA_MISMATCH',name);
    assert(Array.isArray(table.rows) && int(table.rowCount,0,200000) && table.rowCount===table.rows.length,'TABLE_ROW_COUNT_MISMATCH',name);
    totalRows+=table.rowCount; assert(totalRows<=500000,'EXCESSIVE_ROW_COUNT');
    let previous=null;
    for(const row of table.rows) {
      keys(row,definition.columns,definition.columns,name);
      for(const column of definition.types) {
        const value=row[column.name];
        assert(value===null ? !column.notnull && !definition.primaryKey.includes(column.name) : column.type==='INTEGER' ? int(value,Number.MIN_SAFE_INTEGER) : str(value,2*1024*1024),'INVALID_SQL_VALUE',`${name}.${column.name}`);
      }
      assert(row.owner_id==='site-owner','ROW_OWNER_MISMATCH',name);
      const key=pk(row,definition); assert(previous===null || previous<key,'UNSORTED_OR_DUPLICATE_PRIMARY_KEY',name); previous=key;
    }
    if(verifyHashes) assert(HASH.test(table.sha256) && await sha256Value(tableContent(table))===table.sha256,'TABLE_CHECKSUM_MISMATCH',name);
    parsed[name]=table.rows;
  }
  const known=new Set(words.keys());
  for(const row of parsed.custom_lexicon) {
    assert(ID.test(row.record_id) && ['word','scene'].includes(row.kind),'INVALID_CUSTOM_LEXICON_RECORD');
    const payload=json(row.payload_json,'custom_lexicon.payload_json'); assert(payload.id===row.record_id,'CUSTOM_ID_MISMATCH');
    if(row.kind==='word') {validateWord(payload);assert(!known.has(payload.id),'CUSTOM_WORD_COLLISION');known.add(payload.id);words.set(payload.id,payload);}
  }
  for(const row of parsed.custom_lexicon.filter(row=>row.kind==='scene')) { const scene=json(row.payload_json,'custom scene');validateScene(scene,words);assert(!scenes.has(scene.id),'CUSTOM_SCENE_COLLISION');scenes.set(scene.id,scene); }
  for(const word of words.values()) assert(word.sceneIds.every(id=>scenes.has(id)),'WORD_SCENE_REFERENCE_MISSING');
  assert(parsed.user_state.length<=1 && parsed.plan_config.length<=1,'MULTIPLE_OWNER_STATE');
  if(totalRows>0 && parsed.user_state.length===0) assert(TABLE_NAMES.every(name=>parsed[name].length===0 || name==='word_marks' || name==='mark_operations'),'USER_STATE_MISSING');
  for(const row of parsed.user_state) {
    validateSettings(json(row.settings_json,'settings_json')); assert(int(row.updated_at),'INVALID_TIMESTAMP');
    const lexicon=json(row.lexicon_json,'lexicon_json'); keys(lexicon,['words','scenes']);assert(Array.isArray(lexicon.words)&&Array.isArray(lexicon.scenes),'INVALID_LEGACY_LEXICON');
    for(const word of lexicon.words) {validateWord(word);assert(known.has(word.id),'LEGACY_LEXICON_ID_NOT_KNOWN');}
    for(const scene of lexicon.scenes) validateScene(scene,words);
  }
  const today=shanghai(Date.parse(snapshot.exportedAt));
  const progress=new Map(),events=new Map(),eventsByClaim=new Map(),plans=new Map(),reservations=new Map(),marks=new Map(),batches=new Map();
  for(const row of parsed.word_progress) {assert(known.has(row.word_id)&&int(row.revision,1),'INVALID_PROGRESS_ROW');const p=json(row.progress_json,'progress_json');assert(p.wordId===row.word_id,'PROGRESS_ID_MISMATCH');validateProgress(p,known,today);progress.set(row.word_id,{row,value:p});}
  for(const row of parsed.review_events) {
    assert(OP_ID.test(row.event_id)&&known.has(row.word_id)&&grade(row.grade)&&safeToken(row.claim_token)&&int(row.created_at),'INVALID_REVIEW_EVENT');
    const result=validateEventResult(json(row.result_json,'review result'),known,today);assert(result.wordId===row.word_id&&result.grade===row.grade,'REVIEW_EVENT_RESULT_MISMATCH');
    assert(result.progress.lastExposureOn===shanghai(row.created_at),'REVIEW_EVENT_DATE_MISMATCH');assert(progress.has(row.word_id)&&progress.get(row.word_id).value.firstLearnedOn===result.progress.firstLearnedOn,'EVENT_PROGRESS_REFERENCE_MISMATCH');const item={row,value:result};events.set(row.event_id,item);
    let claim=eventsByClaim.get(row.claim_token);if(!claim){claim=new Map();eventsByClaim.set(row.claim_token,claim);}assert(!claim.has(row.word_id),'DUPLICATE_EVENT_CLAIM_WORD');claim.set(row.word_id,item);
  }
  for(const row of parsed.daily_plans) {assert(date(row.day)&&int(row.generations,0,3)&&safeToken(row.claim_token,true)&&(row.locked_until===null||int(row.locked_until))&&int(row.updated_at),'INVALID_LEGACY_PLAN');if(row.plan_json!==null) validatePlan(json(row.plan_json,'daily plan'),known,scenes,row.day);}
  for(const row of parsed.plan_config) assert(date(row.start_date)&&int(row.horizon_days,1,365)&&int(row.page_size,0,200)&&safeToken(row.lease_token,true)&&(row.lease_until===null||int(row.lease_until))&&int(row.retry_after)&&int(row.created_at)&&int(row.updated_at)&&row.updated_at>=row.created_at&&(row.lease_token===null)===(row.lease_until===null),'INVALID_PLAN_CONFIG');
  const plannedNew=new Set();
  for(const row of parsed.scheduled_days) {
    assert(date(row.day)&&int(row.day_index,1)&&int(row.created_at)&&(row.completed_at===null||int(row.completed_at))&&parsed.plan_config.length===1,'INVALID_SCHEDULED_DAY');
    const config=parsed.plan_config[0];assert(addDay(config.start_date,row.day_index-1)===row.day,'SCHEDULED_DATE_INDEX_MISMATCH');
    if(row.completed_at!==null) assert(row.completed_at>=row.created_at&&shanghai(row.completed_at)===row.day,'INVALID_DAY_COMPLETION_DATE');
    const plan=validatePlan(json(row.plan_json,'scheduled plan'),known,scenes,row.day);plans.set(row.day,{row,value:plan});
    for(const id of plan.wordIds) {assert(!plannedNew.has(id),'DUPLICATE_SCHEDULED_NEW_WORD');plannedNew.add(id);}
  }
  for(const row of parsed.reserved_words) {assert(known.has(row.word_id)&&date(row.day)&&plans.has(row.day)&&plans.get(row.day).value.wordIds.includes(row.word_id),'ORPHAN_RESERVATION');reservations.set(row.word_id,row);}
  for(const [day,{value:plan}] of plans) for(const id of plan.wordIds) assert(reservations.get(id)?.day===day || progress.get(id)?.value.firstLearnedOn!==undefined && progress.get(id)?.value.firstLearnedOn!==null,'PLANNED_NEW_WORD_NOT_RESERVED');
  for(const row of parsed.review_batches) {
    assert(/^[A-Za-z0-9_-]{8,64}$/.test(row.batch_id)&&HASH.test(row.payload_hash)&&safeToken(row.claim_token)&&int(row.created_at),'INVALID_REVIEW_BATCH');
    const result=json(row.result_json,'batch result');keys(result,['date','day','results','progress','dayCompleted']);
    assert(date(result.date)&&date(result.day)&&result.day<=result.date&&result.date===shanghai(row.created_at)&&Array.isArray(result.results)&&result.results.length<=200&&Array.isArray(result.progress)&&result.progress.length===result.results.length&&typeof result.dayCompleted==='boolean','INVALID_REVIEW_BATCH_RESULT');
    assert(unique(result.results.map(event=>event.wordId)),'DUPLICATE_BATCH_WORD');
    for(let index=0;index<result.results.length;index++) {
      const event=validateEventResult(result.results[index],known,today);assert(same(event.progress,result.progress[index]),'BATCH_PROGRESS_MISMATCH');
      const stored=eventsByClaim.get(row.claim_token)?.get(event.wordId);assert(stored&&same(stored.value,event),'BATCH_EVENT_MISSING');
    }
    assert((eventsByClaim.get(row.claim_token)?.size??0)===result.results.length,'BATCH_EVENT_COUNT_MISMATCH');
    if(result.dayCompleted) assert(plans.get(result.date)?.row.completed_at!==null && plans.has(result.date),'COMPLETED_BATCH_DAY_MISSING');
    batches.set(row.batch_id,{row,value:result});
  }
  for(const [day,{row}] of plans) if(row.completed_at!==null) assert([...batches.values()].some(item=>item.value.dayCompleted&&item.value.date===day),'COMPLETION_BATCH_LOG_MISSING',day);
  for(const row of parsed.word_marks) {assert(known.has(row.word_id)&&int(row.hard_count)&&int(row.revision,1)&&int(row.updated_at),'INVALID_WORD_MARK');marks.set(row.word_id,row);}
  for(const row of parsed.mark_operations) assert(OP_ID.test(row.op_id)&&known.has(row.word_id)&&(row.delta===1||row.delta===-1)&&safeToken(row.claim_token)&&int(row.created_at)&&marks.has(row.word_id),'INVALID_MARK_OPERATION');
  const reviewCounts=new Map(),markCounts=new Map();for(const event of parsed.review_events)reviewCounts.set(event.word_id,(reviewCounts.get(event.word_id)??0)+1);for(const op of parsed.mark_operations)markCounts.set(op.word_id,(markCounts.get(op.word_id)??0)+1);
  for(const [wordId,count] of reviewCounts)assert(progress.get(wordId).row.revision>=count,'PROGRESS_REVISION_BELOW_EVENT_COUNT');
  for(const [wordId,count] of markCounts)assert(marks.get(wordId).revision>=count,'MARK_REVISION_BELOW_OPERATION_COUNT');
  const summary={tables:Object.fromEntries(TABLE_NAMES.map(name=>[name,parsed[name].length])),wordCount:known.size,sceneCount:scenes.size,learnedCount:[...progress.values()].filter(item=>item.value.firstLearnedOn!==null).length,solidCount:[...progress.values()].filter(item=>item.value.stage===3).length,progressCount:progress.size,markCount:marks.size,hardCountTotal:[...marks.values()].reduce((sum,row)=>sum+BigInt(row.hard_count),0n).toString(),reviewEventCount:events.size,reviewBatchCount:batches.size,markOperationCount:parsed.mark_operations.length,scheduledDayCount:plans.size,reservedWordCount:reservations.size,customWordCount:parsed.custom_lexicon.filter(row=>row.kind==='word').length,customSceneCount:parsed.custom_lexicon.filter(row=>row.kind==='scene').length};
  if(verifyHashes) {
    assert(snapshot.summary!==undefined&&same(snapshot.summary,summary),'SUMMARY_MISMATCH');
    assert(HASH.test(snapshot.contentSha256)&&await sha256Value(contentManifest(snapshot))===snapshot.contentSha256,'CONTENT_CHECKSUM_MISMATCH');
  }
  noSecrets(snapshot);
  assert(jsonSize(snapshot)<=MAX_BACKUP_BYTES,'BACKUP_TOO_LARGE');
  return {summary,parsed,known,words,scenes,progress,events,plans,reservations,marks,batches};
}
/** Seal without deep-cloning record arrays; exporter must already supply stable PK order. */
export async function sealSnapshot(raw) {
  const context=await inspectSnapshot(raw,false);
  const seedDigest=await sha256Value({words:raw.application.seed.words,scenes:raw.application.seed.scenes,info:raw.application.seed.info});
  const tables={};
  for(const name of TABLE_NAMES) {
    const table=raw.tables[name],digest=await sha256Value(tableContent(table));
    if(table.sha256!==undefined) assert(table.sha256===digest,'TABLE_CHECKSUM_MISMATCH',name);
    tables[name]={...table,sha256:digest};
  }
  const snapshot={...raw,application:{...raw.application,seed:{...raw.application.seed,sha256:seedDigest}},tables,summary:context.summary};
  snapshot.contentSha256=await sha256Value(contentManifest(snapshot));
  assert(jsonSize(snapshot)<=MAX_BACKUP_BYTES,'BACKUP_TOO_LARGE');
  return snapshot;
}
export async function validateSnapshot(snapshot) {
  const context=await inspectSnapshot(snapshot,true);
  return {valid:true,contentSha256:snapshot.contentSha256,summary:context.summary};
}
function rowMap(snapshot,name) {const definition=TABLE_DEFINITIONS[name];return new Map(snapshot.tables[name].rows.map(row=>[pk(row,definition),row]));}
function requirePreservedRows(previous,next,name) {
  const oldRows=rowMap(previous,name),newRows=rowMap(next,name);
  for(const [key,row] of oldRows) assert(newRows.has(key)&&same(newRows.get(key),row),'IMMUTABLE_HISTORY_LOST_OR_CHANGED',name);
}
function blankProgress(wordId) { return {wordId,firstLearnedOn:null,stage:0,nextDueOn:null,lastReviewedOn:null,lastExposureOn:null,exposuresToday:0,lastGrade:null}; }
function replayGrade(current, event) {
  const day=shanghai(event.row.created_at),value=event.row.grade;
  if(current.firstLearnedOn!==null&&day<current.firstLearnedOn || current.lastExposureOn!==null&&day<current.lastExposureOn) return null;
  const exposures=current.lastExposureOn===day?current.exposuresToday:0;
  if(exposures>=3) return {wordId:current.wordId,grade:value,progress:{...current},applied:false,reason:'daily_limit'};
  const p={...current,lastExposureOn:day,exposuresToday:exposures+1,lastGrade:value};
  if(p.firstLearnedOn===null) {p.firstLearnedOn=day;p.stage=0;p.nextDueOn=addDay(day,1);p.lastReviewedOn=day;}
  else if(p.lastReviewedOn!==day&&p.nextDueOn!==null&&p.nextDueOn<=day) {
    p.lastReviewedOn=day;
    if(value==='remembered') {p.stage=Math.min(3,p.stage+1);p.nextDueOn=p.stage===3?null:[addDay(p.firstLearnedOn,[1,3,7][p.stage]),addDay(day,1)].sort().at(-1);}
    else p.nextDueOn=addDay(day,1);
  } else if(value!=='remembered') {if(p.stage===3)p.stage=2;p.nextDueOn=addDay(day,1);}
  return {wordId:p.wordId,grade:value,progress:p,applied:true,reason:'applied'};
}
function verifyReviewChain(oldProgress, nextProgress, events, wordId) {
  let current=oldProgress;
  assert(events.length>0,'PROGRESS_CHANGE_WITHOUT_NEW_REVIEW_EVIDENCE',wordId);
  const ordered=[...events].sort((a,b)=>a.row.created_at-b.row.created_at);
  let position=0;
  while(position<ordered.length) {
    const timestamp=ordered[position].row.created_at,group=[];
    while(position<ordered.length&&ordered[position].row.created_at===timestamp) group.push(ordered[position++]);
    // Same-millisecond results encode their own state dependencies; no arbitrary event-ID order.
    while(group.length) {
      let chosen=-1;
      for(let index=0;index<group.length;index++) {const expected=replayGrade(current,group[index]);if(expected&&same(expected,group[index].value)){chosen=index;break;}}
      assert(chosen!==-1,'REVIEW_TRANSITION_EVIDENCE_INVALID',wordId);
      current=group[chosen].value.progress;group[chosen]=group[group.length-1];group.pop();
    }
  }
  assert(same(current,nextProgress),'LATEST_REVIEW_PROGRESS_MISMATCH',wordId);
}
function assertProgressContinuity(oldProgress,nextContext,newEvents,requireEvidence=true,includeNew=true) {
  const byWord=new Map();for(const event of newEvents){let list=byWord.get(event.row.word_id);if(!list){list=[];byWord.set(event.row.word_id,list);}list.push(event);}
  for(const [wordId,oldItem] of oldProgress) {
    const old=oldItem.value??oldItem,nextItem=nextContext.progress.get(wordId);
    assert(nextItem!==undefined,'PROGRESS_ID_LOST',wordId);
    const next=nextItem.value;
    if(old.firstLearnedOn!==null) assert(next.firstLearnedOn===old.firstLearnedOn,'FIRST_LEARNED_DATE_RESET',wordId);
    if(oldItem.row) assert(nextItem.row.revision>=oldItem.row.revision,'PROGRESS_REVISION_REGRESSION',wordId);
    const evidence=byWord.get(wordId)??[];
    if(same(old,next)&&evidence.length===0) continue;
    assert(next.firstLearnedOn!==null || old.firstLearnedOn===null,'LEARNED_PROGRESS_RESET',wordId);
    assert(old.lastReviewedOn===null || next.lastReviewedOn!==null&&next.lastReviewedOn>=old.lastReviewedOn,'PROGRESS_DATE_REGRESSION',wordId);
    assert(old.lastExposureOn===null || next.lastExposureOn!==null&&next.lastExposureOn>=old.lastExposureOn,'PROGRESS_DATE_REGRESSION',wordId);
    if(requireEvidence) verifyReviewChain(old,next,evidence,wordId);
  }
  if(includeNew) for(const [wordId,item] of nextContext.progress) if(!oldProgress.has(wordId)&&item.value.firstLearnedOn!==null) verifyReviewChain(blankProgress(wordId),item.value,byWord.get(wordId)??[],wordId);
}
function markReachability(initial,operations) {
  let low=BigInt(initial),high=low;
  const ordered=[...operations].sort((a,b)=>a.created_at-b.created_at);
  let position=0;
  while(position<ordered.length) {
    const timestamp=ordered[position].created_at;let plus=0n,minus=0n;
    while(position<ordered.length&&ordered[position].created_at===timestamp) {if(ordered[position++].delta===1)plus++;else minus++;}
    // Earliest pluses followed by minuses minimize; minuses first maximize the floor-zero result.
    low=low+plus-minus;if(low<0n)low=0n;
    high=(high>minus?high-minus:0n)+plus;
  }
  return {low,high};
}
function newMarkEvidence(operations,oldMark,newMark) {
  const {low,high}=markReachability(oldMark.hard_count,operations);
  const actual=BigInt(newMark.hard_count);
  assert(actual>=low&&actual<=high,'MARK_CHANGE_WITHOUT_OPERATION_EVIDENCE',oldMark.word_id);
  assert(newMark.revision-oldMark.revision===operations.length,'MARK_REVISION_WITHOUT_OPERATION_EVIDENCE',oldMark.word_id);
  return low!==high;
}
/** Content-level overwrite decision. Never use file size or top-level counts as preservation proof.
 * @param {any} next
 * @param {any} [previous]
 * @param {any} [legacyBaseline]
 */
export async function compareSnapshots(next,previous=null,legacyBaseline=null) {
  try {
    assert(previous!==null||legacyBaseline!==null,'BASELINE_REQUIRED');
    const nextContext=await inspectSnapshot(next,true),warnings=new Set();
    if(legacyBaseline!==null&&validateLegacyContinuity(legacyBaseline,nextContext,next.exportedAt)) warnings.add('same_timestamp_order_ambiguous');
    if(previous!==null) {
      const oldContext=await inspectSnapshot(previous,true);
      if(previous.contentSha256===next.contentSha256) return {decision:'unchanged',reasons:[],warnings:[...warnings],contentSha256:next.contentSha256,summary:nextContext.summary};
      assert(next.scope.ownerId===previous.scope.ownerId,'OWNER_SCOPE_CHANGED');
      for(const name of ['review_events','review_batches','mark_operations','reserved_words']) requirePreservedRows(previous,next,name);
      const oldCustom=rowMap(previous,'custom_lexicon'),newCustom=rowMap(next,'custom_lexicon');
      for(const key of oldCustom.keys()) assert(newCustom.has(key),'CUSTOM_LEXICON_ID_LOST');
      for(const id of oldContext.known) assert(nextContext.known.has(id),'KNOWN_WORD_ID_LOST',id);
      const oldEvents=new Set(previous.tables.review_events.rows.map(row=>row.event_id));
      const addedEvents=[...nextContext.events.values()].filter(item=>!oldEvents.has(item.row.event_id));
      assertProgressContinuity(oldContext.progress,nextContext,addedEvents);
      for(const [wordId,item] of oldContext.progress) assert(nextContext.progress.get(wordId).row.revision>=item.row.revision,'PROGRESS_REVISION_REGRESSION');
      for(const [day,{row,value}] of oldContext.plans) {
        const current=nextContext.plans.get(day);assert(current&&same(current.value,value)&&current.row.day_index===row.day_index&&current.row.created_at===row.created_at,'FROZEN_PLAN_LOST_OR_CHANGED',day);
        if(row.completed_at!==null) assert(current.row.completed_at===row.completed_at,'DAY_COMPLETION_LOST_OR_CHANGED',day);
      }
      const oldDaily=rowMap(previous,'daily_plans'),newDaily=rowMap(next,'daily_plans');
      for(const [key,row] of oldDaily) if(row.plan_json!==null) assert(newDaily.has(key)&&newDaily.get(key).plan_json===row.plan_json,'LEGACY_FROZEN_PLAN_LOST');
      if(oldContext.parsed.plan_config.length) assert(nextContext.parsed.plan_config.length===1&&nextContext.parsed.plan_config[0].start_date===oldContext.parsed.plan_config[0].start_date,'PLANNING_START_RESET');
      if(oldContext.parsed.user_state.length) assert(nextContext.parsed.user_state.length===1&&nextContext.parsed.user_state[0].updated_at>=oldContext.parsed.user_state[0].updated_at,'USER_STATE_RESET');
      const oldOpIds=new Set(previous.tables.mark_operations.rows.map(row=>row.op_id)),addedOpsByWord=new Map();
      for(const op of next.tables.mark_operations.rows) if(!oldOpIds.has(op.op_id)){let list=addedOpsByWord.get(op.word_id);if(!list){list=[];addedOpsByWord.set(op.word_id,list);}list.push(op);}
      for(const [wordId,oldMark] of oldContext.marks) {
        const current=nextContext.marks.get(wordId);assert(current&&current.revision>=oldMark.revision&&current.updated_at>=oldMark.updated_at,'WORD_MARK_LOST_OR_RESET',wordId);
        if((!same(current,oldMark)||(addedOpsByWord.get(wordId)?.length??0)>0)&&newMarkEvidence(addedOpsByWord.get(wordId)??[],oldMark,current)) warnings.add('same_timestamp_order_ambiguous');
      }
      for(const [wordId,mark] of nextContext.marks) if(!oldContext.marks.has(wordId)&&(addedOpsByWord.get(wordId)?.length??0)>0&&newMarkEvidence(addedOpsByWord.get(wordId),{word_id:wordId,hard_count:0,revision:0},mark)) warnings.add('same_timestamp_order_ambiguous');
    }
    return {decision:'approve',reasons:[],warnings:[...warnings],contentSha256:next.contentSha256,summary:nextContext.summary};
  } catch(error) {
    return {decision:'reject',reasons:[error instanceof BackupValidationError?error.code:'INVALID_BACKUP'],detail:error instanceof Error?error.message:'Invalid backup'};
  }
}
function validateLegacyContinuity(legacy,nextContext,exportedAt) {
  let ambiguous=false;
  obj(legacy);assert(legacy.format==='vocab-wheel-backup'&&[1,2,3].includes(legacy.schemaVersion)&&Array.isArray(legacy.progress)&&legacy.progress.length<=20000&&iso(legacy.exportedAt),'INVALID_LEGACY_BASELINE');
  const progress=new Map();
  for(const p of legacy.progress) {validateProgress(p,nextContext.known,shanghai(Date.parse(exportedAt)));assert(!progress.has(p.wordId),'DUPLICATE_LEGACY_PROGRESS');progress.set(p.wordId,p);}
  const cutoff=Date.parse(legacy.exportedAt);
  const events=[...nextContext.events.values()].filter(item=>{
    if(item.row.created_at>cutoff) return true;
    if(item.row.created_at<cutoff) return false;
    const baseline=progress.get(item.row.word_id),result=item.value.progress;
    // v3 has no event IDs: equal-millisecond results already reflected by its exact
    // state (or an earlier exposure that day) must not be replayed a second time.
    const represented=baseline&&result.firstLearnedOn===baseline.firstLearnedOn&&result.lastExposureOn===baseline.lastExposureOn&&(result.exposuresToday<baseline.exposuresToday||same(result,baseline));
    return !represented;
  });
  assertProgressContinuity(progress,nextContext,events,true,false);
  obj(legacy.lexicon);assert(Array.isArray(legacy.lexicon.words)&&Array.isArray(legacy.lexicon.scenes),'INVALID_LEGACY_BASELINE');
  for(const word of legacy.lexicon.words) assert(nextContext.words.has(word.id),'LEGACY_CUSTOM_ID_LOST');
  for(const scene of legacy.lexicon.scenes) assert(nextContext.scenes.has(scene.id),'LEGACY_CUSTOM_SCENE_LOST');
  if(legacy.marks!==undefined) for(const oldMark of legacy.marks) {
    assert(nextContext.known.has(oldMark.wordId)&&int(oldMark.hardCount),'INVALID_LEGACY_MARK');
    const mark=nextContext.marks.get(oldMark.wordId);assert(mark!==undefined,'LEGACY_MARK_LOST');
    const recent=nextContext.parsed.mark_operations.filter(op=>op.word_id===oldMark.wordId&&op.created_at>cutoff);
    if(mark.hard_count!==oldMark.hardCount||recent.length>0) {
      const {low,high}=markReachability(oldMark.hardCount,recent),actual=BigInt(mark.hard_count);assert(actual>=low&&actual<=high,'LEGACY_MARK_CHANGE_WITHOUT_EVIDENCE');if(low!==high)ambiguous=true;
    }
  }
  return ambiguous;
}
