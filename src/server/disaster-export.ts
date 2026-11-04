import { sealSnapshot, TABLE_DEFINITIONS } from '../backup/format.mjs';
import { disasterMetadata } from '../generated/disaster-metadata.ts';
import { seedWords, seedScenes, lexiconInfo } from '../data/seed.ts';
import { DISASTER_TABLES, DISASTER_INTERNAL_TABLES, type DisasterRow, type DisasterTable, type RawDisasterSnapshot } from './disaster-schema.ts';

export const DISASTER_MAX_BYTES=16*1024*1024;
export const DISASTER_MAX_ROWS_PER_TABLE=200_000;
export class DisasterExportError extends Error {
  status:number;code:string;
  constructor(status:number,code:string,message:string){super(message);this.name='DisasterExportError';this.status=status;this.code=code;}
}
export interface DisasterExportOptions {maxBytes?:number;maxRowsPerTable?:number;now?:()=>number}
export type DisasterSnapshot=RawDisasterSnapshot&{contentSha256:string;summary:Record<string,unknown>};
type Stat={table_name:string;row_count:number;json_bytes:number};
type Catalog={name:string;type:string;tbl_name:string;sql:string|null};
type Column={cid:number;name:string;type:string;notnull:number;dflt_value:string|null;pk:number};
const q=(identifier:string)=>`"${identifier.replaceAll('"','""')}"`;
const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
const failure=(status:number,code:string,message:string):never=>{throw new DisasterExportError(status,code,message);};
function limit(value:number|undefined,fallback:number,maximum:number){const n=value??fallback;if(!Number.isSafeInteger(n)||n<1||n>maximum) return failure(400,'DISASTER_INVALID_LIMIT','灾备安全容量参数无效');return n;}
/**
 * JSON is measured one row at a time; never aggregate database rows into a cell.
 * workerd caps a compound SELECT at FIVE terms (Node SQLite defaults to 500),
 * so do not UNION eleven tables. This array holds eleven tiny statistics only.
 */
function statsSQL(){
 const entries=DISASTER_TABLES.map(t=>`json((SELECT json_object('table_name','${t.name}','row_count',COUNT(*),'json_bytes',COALESCE(SUM(LENGTH(CAST(json_object(${t.columns.flatMap(c=>[`'${c.name}'`,q(c.name)]).join(',')}) AS BLOB))+1),0)) FROM ${q(t.name)} WHERE owner_id=?))`);
 return `SELECT json_extract(value,'$.table_name') AS table_name,json_extract(value,'$.row_count') AS row_count,json_extract(value,'$.json_bytes') AS json_bytes FROM json_each(json_array(${entries.join(',')}))`;
}
function resultRows<T>(result:D1Result<unknown>|undefined):T[]{if(!result||(result as unknown as {success:boolean}).success===false||!Array.isArray(result.results)) return failure(503,'DISASTER_QUERY_FAILED','灾备读取未成功，未生成完整文件');return result.results as T[];}
function checkStats(stats:Stat[],maxRows:number,budget:number){
 if(stats.length!==DISASTER_TABLES.length||new Set(stats.map(s=>s.table_name)).size!==DISASTER_TABLES.length) return failure(503,'DISASTER_COUNT_INCOMPLETE','灾备行数检查不完整，未生成文件');
 let total=0;
 for(const t of DISASTER_TABLES){const s=stats.find(v=>v.table_name===t.name);if(!s||!Number.isSafeInteger(s.row_count)||s.row_count<0||!Number.isSafeInteger(s.json_bytes)||s.json_bytes<0) return failure(503,'DISASTER_COUNT_INVALID','灾备行数或容量检查异常');if(s.row_count>maxRows) return failure(413,'DISASTER_LIMIT_EXCEEDED','灾备行数超过安全容量，完整文件未生成；请扩容备份流程后重试。');total+=s.json_bytes;}
 if(total>budget) return failure(413,'DISASTER_LIMIT_EXCEEDED','灾备超过安全容量，完整文件未生成；请扩容备份流程后重试。');
}
function validateCatalog(rows:Catalog[]){
 const expected=new Set(DISASTER_TABLES.map(t=>t.name));const seen=new Set<string>();
 for(const item of rows){
  if(!item||typeof item.name!=='string'||typeof item.tbl_name!=='string'||typeof item.type!=='string') return failure(503,'DISASTER_SCHEMA_INVALID','数据库结构读取异常，完整文件未生成。');
  if(item.name.startsWith('sqlite_')) continue;
  if(DISASTER_INTERNAL_TABLES.has(item.name)||DISASTER_INTERNAL_TABLES.has(item.tbl_name)) continue;
  if(item.type==='index'&&item.sql===null&&expected.has(item.tbl_name)) continue;
  if(item.type!=='table'||!expected.has(item.name)||typeof item.sql!=='string'||seen.has(item.name)){
   // Schema identifiers only; never emit sqlite_master.sql, table rows or bindings.
   console.error('[vocab-wheel] disaster schema mismatch',JSON.stringify({reason:'unexpected_schema_object',name:item.name.slice(0,512),type:item.type.slice(0,64),table:item.tbl_name.slice(0,512)}));
   return failure(409,'DISASTER_SCHEMA_MISMATCH','发现未纳入灾备的表或数据库对象，完整文件未生成。');
  }
  seen.add(item.name);
 }
 if(seen.size!==expected.size) return failure(409,'DISASTER_SCHEMA_MISMATCH','应用数据库表缺失，完整文件未生成。');
}
function validateColumns(columns:Column[],table:typeof DISASTER_TABLES[number]){
 if(columns.length!==table.columns.length) return failure(409,'DISASTER_SCHEMA_MISMATCH','数据库字段发生变化，完整文件未生成。');
 for(let i=0;i<columns.length;i++){const actual=columns[i],wanted=table.columns[i];if(!actual||typeof actual.type!=='string'||actual.cid!==i||actual.name!==wanted.name||actual.type.toUpperCase()!==wanted.type||Boolean(actual.notnull)!==!wanted.nullable||actual.pk!==(table.primaryKey.indexOf(wanted.name)+1)) return failure(409,'DISASTER_SCHEMA_MISMATCH','数据库字段或主键发生变化，完整文件未生成。');}
}
function validateRows(rows:DisasterRow[],table:typeof DISASTER_TABLES[number],owner:string){
 let previous:DisasterRow|undefined;
 for(const row of rows){
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length!==table.columns.length||row.owner_id!==owner) return failure(503,'DISASTER_ROW_INVALID','灾备记录结构或所属范围异常，完整文件未生成。');
  for(const column of table.columns){const value=row[column.name];if(value===null){if(!column.nullable) return failure(503,'DISASTER_ROW_INVALID','灾备记录含无效空值，未生成完整文件。');}else if(column.type==='TEXT'?typeof value!=='string':!Number.isSafeInteger(value)) return failure(503,'DISASTER_ROW_INVALID','灾备记录含无法无损保存的值，未生成完整文件。');}
  if(previous){let order=0;for(const key of table.primaryKey){const a=previous[key] as string,b=row[key] as string;if(a!==b){order=a<b?-1:1;break;}}if(order>=0) return failure(503,'DISASTER_ORDER_INVALID','灾备记录顺序或主键重复，未生成完整文件。');}
  previous=row;
 }
}
function readError(error:unknown,stage:'preflight'|'capture'):never{
 if(error instanceof DisasterExportError) throw error;
 // D1 often wraps the useful SQL error in cause. Inspect locally, but log only
 // fixed categories/codes: never SQL, binding values, user JSON or raw messages.
 const messages:string[]=[];const seen=new Set<unknown>();let current=error;
 for(let depth=0;depth<5&&current&&typeof current==='object'&&!seen.has(current);depth++){seen.add(current);const item=current as {message?:unknown;cause?:unknown};if(typeof item.message==='string')messages.push(item.message);current=item.cause;}
 const message=messages.join('\n');
 const reason=/too many terms in compound SELECT/i.test(message)?'compound_select_limit':/too many SQL variables/i.test(message)?'bound_parameter_limit':/not authorized|SQLITE_AUTH/i.test(message)?'sql_authorization':/no such function/i.test(message)?'unsupported_sql_function':/syntax error|unrecognized token/i.test(message)?'sql_syntax':/no such (?:table|column)|schema.*(?:changed|mismatch)/i.test(message)?'schema_mismatch':/represented as a (?:JavaScript )?number|outside.*safe.*integer|BLOB values/i.test(message)?'unsafe_cell':/too (?:big|large)|SQLITE_TOOBIG|(?:size|memory).*(?:limit|exceed)/i.test(message)?'capacity_limit':/timed? out|timeout|overload/i.test(message)?'database_unavailable':'unknown_database_error';
 const sqliteCodes=[...new Set(message.match(/\b(?:D1_ERROR|SQLITE_(?:ERROR|AUTH|TOOBIG|NOMEM|BUSY|LOCKED|CORRUPT|IOERR|INTERRUPT))\b/g)??[])];
 console.error('[vocab-wheel] disaster capture failed',JSON.stringify({stage,reason,sqliteCodes}));
 if(/represented as a (?:JavaScript )?number|outside.*safe.*integer|BLOB values/i.test(message)) return failure(503,'DISASTER_ROW_INVALID','灾备记录含无法无损保存的值，未生成完整文件。');
 if(/no such (?:table|column)|schema.*(?:changed|mismatch)/i.test(message)) return failure(409,'DISASTER_SCHEMA_MISMATCH','应用数据库结构发生变化，完整文件未生成。');
 if(/too (?:big|large)|SQLITE_TOOBIG|(?:size|memory).*(?:limit|exceed)/i.test(message)) return failure(413,'DISASTER_LIMIT_EXCEEDED','灾备超过数据库读取容量，完整文件未生成。');
 return failure(503,'DISASTER_CAPTURE_FAILED','灾备一致性读取失败，未生成完整文件，请稍后重试。');
}
/**
 * Read-only, coherent raw disaster export. No bootstrap/context call, write, env
 * read, provider invocation, or request-supplied owner is involved.
 * D1 executes batch statements in one SQL transaction. The earlier preflight is
 * only a capacity guard; schema, counts and ALL rows are checked again inside it.
 */
export async function exportDisasterBackup(db:D1Database,owner='site-owner',options:DisasterExportOptions={}):Promise<DisasterSnapshot>{
 if(owner!=='site-owner') return failure(409,'DISASTER_SCOPE_MISMATCH','灾备仅支持当前服务端单人数据范围。');
 const maxBytes=limit(options.maxBytes,DISASTER_MAX_BYTES,DISASTER_MAX_BYTES);
 const maxRows=limit(options.maxRowsPerTable,DISASTER_MAX_ROWS_PER_TABLE,DISASTER_MAX_ROWS_PER_TABLE);
 const clock=options.now??Date.now;let exportedAt=new Date(clock()).toISOString();
 const application={name:disasterMetadata.name,packageVersion:disasterMetadata.packageVersion,sourceTreeSha256:disasterMetadata.sourceTreeSha256,baseCommit:disasterMetadata.baseCommit,schemaVersion:3 as const,migrations:disasterMetadata.migrations.map(m=>({...m})),seed:{words:seedWords,scenes:seedScenes,info:lexiconInfo,sha256:disasterMetadata.seedSha256}};
 const skeletonTables=Object.fromEntries(DISASTER_TABLES.map(t=>[t.name,{columns:t.columns.map(c=>c.name),primaryKey:[...t.primaryKey],schemaSql:TABLE_DEFINITIONS[t.name as keyof typeof TABLE_DEFINITIONS].schemaSql,rows:[],rowCount:0}]));
 // A small checksum/summary reserve is deliberately conservative near the limit.
 const baseBytes=bytes({format:'vocab-wheel-disaster-backup',version:1,exportedAt,complete:true,scope:{ownerId:owner},application,tables:skeletonTables})+16*1024;
 const dataBudget=maxBytes-baseBytes;
 if(dataBudget<0) return failure(413,'DISASTER_LIMIT_EXCEEDED','灾备元数据超过安全容量，完整文件未生成。');
 const aggregate=statsSQL();const ownerArgs=DISASTER_TABLES.map(()=>owner);
 let preflight:D1Result<unknown>[];
 try{preflight=await db.batch([db.prepare(aggregate).bind(...ownerArgs)]);}catch(error){return readError(error,'preflight');}
 checkStats(resultRows<Stat>(preflight[0]),maxRows,dataBudget);
 const statements:D1PreparedStatement[]=[db.prepare("SELECT name,type,tbl_name,sql FROM sqlite_master ORDER BY name"),...DISASTER_TABLES.map(t=>db.prepare(`PRAGMA table_info(${q(t.name)})`)),db.prepare(aggregate).bind(...ownerArgs)];
 for(const table of DISASTER_TABLES){
  // A concurrent large write after preflight cannot force oversized result arrays:
  // every row SELECT repeats the same global capacity guard in this transaction.
  statements.push(db.prepare(`WITH disaster_capacity AS (${aggregate}) SELECT ${table.columns.map(c=>q(c.name)).join(',')} FROM ${q(table.name)} WHERE owner_id=? AND (SELECT COALESCE(SUM(json_bytes),0)<=? AND MAX(row_count)<=? FROM disaster_capacity) ORDER BY ${table.primaryKey.map(k=>`${q(k)} COLLATE BINARY`).join(',')} LIMIT ?`).bind(...ownerArgs,owner,dataBudget,maxRows,maxRows+1));
 }
 let captured:D1Result<unknown>[];
 try{captured=await db.batch(statements);}catch(error){return readError(error,'capture');}
 if(captured.length!==statements.length) return failure(503,'DISASTER_CAPTURE_INCOMPLETE','灾备事务结果不完整，未生成文件。');
 const catalog=resultRows<Catalog>(captured[0]);validateCatalog(catalog);
 const stats=resultRows<Stat>(captured[DISASTER_TABLES.length+1]);checkStats(stats,maxRows,dataBudget);
 const tables:Record<string,DisasterTable>={};
 for(let i=0;i<DISASTER_TABLES.length;i++){
  const table=DISASTER_TABLES[i];const columns=resultRows<Column>(captured[i+1]);validateColumns(columns,table);
  const rows=resultRows<DisasterRow>(captured[DISASTER_TABLES.length+2+i]);const count=stats.find(s=>s.table_name===table.name)!.row_count;
  if(rows.length!==count||rows.length>maxRows) return failure(503,'DISASTER_TRUNCATED','灾备记录数量与事务内统计不一致，未生成截断文件。');
  validateRows(rows,table,owner);
  tables[table.name]={columns:columns.map(c=>c.name),primaryKey:[...table.primaryKey],schemaSql:catalog.find(c=>c.type==='table'&&c.name===table.name)!.sql!,rows,rowCount:count};
 }
 // Timestamp completion, so a snapshot crossing Shanghai midnight can include
 // newly committed next-day learning without being mistaken for future data.
 exportedAt=new Date(clock()).toISOString();
 const raw:RawDisasterSnapshot={format:'vocab-wheel-disaster-backup',version:1,exportedAt,complete:true,scope:{ownerId:owner},application,tables};
 if(bytes(raw)>maxBytes) return failure(413,'DISASTER_LIMIT_EXCEEDED','完整灾备超过安全容量，文件未生成。');
 let snapshot:DisasterSnapshot;
 try{snapshot=await sealSnapshot(raw) as DisasterSnapshot;}catch(error){
  const code=typeof (error as {code?:unknown})?.code==='string'?(error as {code:string}).code:'';
  if(code==='BACKUP_TOO_LARGE') return failure(413,'DISASTER_LIMIT_EXCEEDED','完整灾备超过安全容量，文件未生成。');
  return failure(503,'DISASTER_VALIDATION_FAILED','灾备内容未通过完整性验证，未生成文件。');
 }
 if(snapshot.application.seed.sha256!==disasterMetadata.seedSha256) return failure(503,'DISASTER_METADATA_MISMATCH','内置词库与构建指纹不一致，未生成文件。');
 if(bytes(snapshot)>maxBytes) return failure(413,'DISASTER_LIMIT_EXCEEDED','完整灾备超过安全容量，文件未生成。');
 return snapshot;
}
