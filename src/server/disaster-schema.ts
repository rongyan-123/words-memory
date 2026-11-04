/** Disaster format v1 captures all owner-scoped application tables, not a v3 merge import. */
export type DisasterCell = string | number | null;
export type DisasterRow = Record<string, DisasterCell>;
export interface DisasterColumn { name: string; type: 'TEXT' | 'INTEGER'; nullable?: boolean }
export interface DisasterTableDefinition { name: string; columns: readonly DisasterColumn[]; primaryKey: readonly string[] }
const text=(name:string,nullable=false):DisasterColumn=>({name,type:'TEXT',...(nullable?{nullable:true}:{})});
const integer=(name:string,nullable=false):DisasterColumn=>({name,type:'INTEGER',...(nullable?{nullable:true}:{})});
/** Explicit projections prevent accidental credential/config table discovery or SELECT *. */
export const DISASTER_TABLES:readonly DisasterTableDefinition[]=[
 {name:'custom_lexicon',columns:[text('owner_id'),text('record_id'),text('kind'),text('payload_json')],primaryKey:['owner_id','record_id','kind']},
 {name:'daily_plans',columns:[text('owner_id'),text('day'),text('plan_json',true),integer('generations'),text('claim_token',true),integer('locked_until',true),integer('updated_at')],primaryKey:['owner_id','day']},
 {name:'mark_operations',columns:[text('owner_id'),text('op_id'),text('word_id'),integer('delta'),text('claim_token'),integer('created_at')],primaryKey:['owner_id','op_id']},
 {name:'plan_config',columns:[text('owner_id'),text('start_date'),integer('horizon_days'),integer('page_size'),text('lease_token',true),integer('lease_until',true),integer('retry_after'),integer('created_at'),integer('updated_at')],primaryKey:['owner_id']},
 {name:'reserved_words',columns:[text('owner_id'),text('word_id'),text('day')],primaryKey:['owner_id','word_id']},
 {name:'review_batches',columns:[text('owner_id'),text('batch_id'),text('payload_hash'),text('claim_token'),text('result_json'),integer('created_at')],primaryKey:['owner_id','batch_id']},
 {name:'review_events',columns:[text('owner_id'),text('event_id'),text('word_id'),text('grade'),text('claim_token'),text('result_json'),integer('created_at')],primaryKey:['owner_id','event_id']},
 {name:'scheduled_days',columns:[text('owner_id'),text('day'),integer('day_index'),text('plan_json'),integer('completed_at',true),integer('created_at')],primaryKey:['owner_id','day']},
 {name:'user_state',columns:[text('owner_id'),text('settings_json'),text('lexicon_json'),integer('updated_at')],primaryKey:['owner_id']},
 {name:'word_marks',columns:[text('owner_id'),text('word_id'),integer('hard_count'),integer('revision'),integer('updated_at')],primaryKey:['owner_id','word_id']},
 {name:'word_progress',columns:[text('owner_id'),text('word_id'),text('progress_json'),integer('revision')],primaryKey:['owner_id','word_id']},
];
/** Only known infrastructure is exempt; a new app table is never silently omitted. */
export const DISASTER_INTERNAL_TABLES=new Set(['d1_migrations','__drizzle_migrations','_node_adapter_migrations','_cf_KV','_cf_METADATA','__appgarden_migrations']);
export interface DisasterMigration { name:string; sha256:string; sql:string }
/** Build-generated, source-only data. Never include runtime env, headers or credentials. */
export interface DisasterBuildMetadata {
 name:string;
 packageVersion:string;
 sourceTreeSha256:string;
 baseCommit:string;
 schemaVersion:3;
 migrations:DisasterMigration[];
 seedSha256:string;
}
export interface DisasterTable {
 columns:string[];
 primaryKey:string[];
 schemaSql:string;
 rows:DisasterRow[];
 rowCount:number;
 sha256?:string;
}
export interface RawDisasterSnapshot {
 format:'vocab-wheel-disaster-backup';
 version:1;
 exportedAt:string;
 complete:true;
 scope:{ownerId:string};
 application:Omit<DisasterBuildMetadata,'seedSha256'>&{seed:{words:unknown[];scenes:unknown[];info:unknown;sha256?:string}};
 tables:Record<string,DisasterTable>;
}
