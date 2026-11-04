/** Recovery drill only: creates a private fresh temporary SQLite DB, never a production connection. */
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {canonicalize,validateSnapshot} from '../src/backup/format.mjs';
import {readSnapshotInput} from '../src/backup/archive.mjs';
const quote=value=>`"${String(value).replaceAll('"','""')}"`;
const normalized=value=>value.replace(/\s+/g,' ').trim().replace(/;$/,'');
export async function restoreIsolated(snapshot,{inspect}={}){
 if(Number(process.versions.node.split('.')[0])<24)throw new Error('NODE_24_REQUIRED');
 const verified=await validateSnapshot(snapshot);
 const directory=mkdtempSync(join(tmpdir(),'vocab-disaster-drill-'));let db;
 try{
  db=new DatabaseSync(join(directory,'isolated.sqlite'));db.exec('PRAGMA foreign_keys=ON;');db.exec('BEGIN IMMEDIATE');
  try{
   for(const migration of snapshot.application.migrations)db.exec(migration.sql);
   // The adapter's bookkeeping is not user data, but lets isolated tests reopen without replaying DDL.
   db.exec('CREATE TABLE _node_adapter_migrations(name TEXT PRIMARY KEY,checksum TEXT NOT NULL)');
   for(const migration of snapshot.application.migrations)db.prepare('INSERT INTO _node_adapter_migrations(name,checksum) VALUES (?,?)').run(migration.name,migration.sha256);
   for(const [name,table]of Object.entries(snapshot.tables)){
    const actual=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(name);
    if(!actual||normalized(actual.sql)!==normalized(table.schemaSql))throw new Error(`RESTORE_SCHEMA_MISMATCH:${name}`);
    const statement=db.prepare(`INSERT INTO ${quote(name)}(${table.columns.map(quote).join(',')}) VALUES (${table.columns.map(()=>'?').join(',')})`);
    for(const row of table.rows)statement.run(...table.columns.map(column=>row[column]));
   }
   db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  const check=db.prepare('PRAGMA quick_check').all();if(check.length!==1||Object.values(check[0])[0]!=='ok')throw new Error('RESTORE_QUICK_CHECK_FAILED');
  const counts={};
  for(const [name,table]of Object.entries(snapshot.tables)){
   const rows=db.prepare(`SELECT ${table.columns.map(quote).join(',')} FROM ${quote(name)} ORDER BY ${table.primaryKey.map(quote).join(',')}`).all();
   if(canonicalize(rows)!==canonicalize(table.rows))throw new Error(`RESTORE_ROWS_MISMATCH:${name}`);counts[name]=rows.length;
  }
  if(inspect)await inspect({db,path:join(directory,'isolated.sqlite'),directory});
  return {mode:'isolated-sqlite-drill',restored:true,quickCheck:'ok',tableCount:Object.keys(counts).length,rowCounts:counts,contentSha256:verified.contentSha256,temporaryFilesRemoved:true};
 }finally{db?.close();rmSync(directory,{recursive:true,force:true});}
}
async function main(){const index=process.argv.indexOf('--snapshot');if(index<0||!process.argv[index+1])throw new Error('Usage: node restore-backup.mjs --snapshot backup.zip');const report=await restoreIsolated(readSnapshotInput(resolve(process.argv[index+1])));process.stdout.write(`${JSON.stringify(report)}\n`);}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{process.stdout.write(`${JSON.stringify({restored:false,error:error instanceof Error?error.message:'RESTORE_FAILED'})}\n`);process.exitCode=2;});
