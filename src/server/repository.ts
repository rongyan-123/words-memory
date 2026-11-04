import { emptyMark, type MarkOperation, type MarkRecord, type MarkSnapshot, type PreparedMark, type WordMark } from './marks.ts';
import { createProgress, defaultSettings, type Grade, type Plan, type Progress, type Scene, type Settings, type Word } from '../core/index.ts';
export interface ImportedLexicon { words: Word[]; scenes: Scene[] }
export interface UserData { settings: Settings; lexicon: ImportedLexicon; progress: Progress[] }
export interface EventResult { wordId: string; grade: Grade; progress: Progress; applied: boolean; reason: string }
export interface PlanRecord { plan: Plan | null; generations: number; updatedAt: number }
export interface PlanningConfig { startDate: string; horizonDays: number; pageSize: number; leaseUntil: number | null; retryAfter: number }
export interface ScheduledDay { date: string; dayIndex: number; plan: Plan; completedAt: number | null }
export interface BatchResult { date: string; day: string; results: EventResult[]; progress: Progress[]; dayCompleted: boolean }
export interface ReviewBatchRecord { payloadHash: string; result: BatchResult }
export interface PreparedReview { eventId: string; revision: number; result: EventResult }
export interface Repository {
  load(owner: string, day: string): Promise<UserData>;
  settings(owner: string, value: Settings): Promise<void>;
  mergeLexicon(owner: string, lexicon: ImportedLexicon): Promise<void>;
  mergeProgress(owner: string, progress: Progress[]): Promise<void>;
  restore(owner: string, lexicon: ImportedLexicon, progress: Progress[], settings: Settings, marks?: MarkSnapshot[]): Promise<void>;
  marks(owner: string): Promise<WordMark[]>;
  marksMany(owner: string, wordIds: string[]): Promise<Map<string,WordMark>>;
  markRecords(owner: string, opIds: string[]): Promise<Map<string,MarkRecord>>;
  customWordIds(owner: string, wordIds: string[]): Promise<Set<string>>;
  commitMarks(owner: string, operations: MarkOperation[], marks: PreparedMark[]): Promise<boolean>;
  event(owner: string, eventId: string): Promise<EventResult | null>;
  progress(owner: string, wordId: string): Promise<{ progress: Progress; revision: number }>;
  commitReview(owner: string, eventId: string, expectedRevision: number, result: EventResult): Promise<boolean>;
  plan(owner: string, day: string): Promise<PlanRecord>;
  claimPlan(owner: string, day: string, token: string, regenerate: boolean): Promise<boolean>;
  savePlan(owner: string, day: string, token: string, plan: Plan): Promise<void>;
  releasePlan(owner: string, day: string, token: string): Promise<void>;
  planning(owner: string, today: string, horizonDays?: number, pageSize?: number): Promise<PlanningConfig>;
  configurePlanning(owner: string, horizonDays: number, pageSize: number): Promise<void>;
  scheduled(owner: string): Promise<ScheduledDay[]>;
  reservations(owner: string): Promise<string[]>;
  claimPlanning(owner: string, token: string): Promise<boolean>;
  commitScheduled(owner: string, token: string, day: ScheduledDay, reserveWordIds?: string[]): Promise<boolean>;
  releasePlanning(owner: string, token: string, failed?: boolean): Promise<void>;
  batchRecord(owner: string, batchId: string): Promise<ReviewBatchRecord | null>;
  progressMany(owner: string, wordIds: string[]): Promise<Map<string, { progress: Progress; revision: number }>>;
  commitBatch(owner: string, batchId: string, payloadHash: string, reviews: PreparedReview[], result: BatchResult, completedDate?: string): Promise<boolean>;
}
/** All writes use owner predicates; no caller supplies ownership from a JSON body. */
export class D1Repository implements Repository {
  private db: D1Database;
  private now: () => number;
  constructor(db: D1Database, now: () => number = Date.now) { this.db = db; this.now = now; }
  async load(owner: string, day: string): Promise<UserData> {
    await this.db.prepare('INSERT OR IGNORE INTO user_state(owner_id, settings_json, lexicon_json, updated_at) VALUES (?, ?, ?, ?)')
      .bind(owner, JSON.stringify(defaultSettings(day)), '{"words":[],"scenes":[]}', this.now()).run();
    const [state, rows, lexiconRows] = await Promise.all([
      this.db.prepare('SELECT settings_json, lexicon_json FROM user_state WHERE owner_id = ?').bind(owner).first<{ settings_json: string; lexicon_json: string }>(),
      this.db.prepare('SELECT progress_json FROM word_progress WHERE owner_id = ?').bind(owner).all<{ progress_json: string }>(),
      this.db.prepare('SELECT kind, payload_json FROM custom_lexicon WHERE owner_id = ? ORDER BY record_id').bind(owner).all<{ kind: string; payload_json: string }>(),
    ]);
    if (!state) throw new Error('User state was not initialized.');
    const imported = (lexiconRows.results ?? []);
    const lexicon: ImportedLexicon = { words: imported.filter(r => r.kind === 'word').map(r => JSON.parse(r.payload_json)), scenes: imported.filter(r => r.kind === 'scene').map(r => JSON.parse(r.payload_json)) };
    return { settings: JSON.parse(state.settings_json), lexicon, progress: (rows.results ?? []).map(row => JSON.parse(row.progress_json)) };
  }
  async settings(owner: string, value: Settings): Promise<void> {
    await this.db.prepare('UPDATE user_state SET settings_json = ?, updated_at = ? WHERE owner_id = ?').bind(JSON.stringify(value), this.now(), owner).run();
  }
  async mergeLexicon(owner: string, lexicon: ImportedLexicon): Promise<void> {
    // The service passes the fully merged, validated set. Progress is never deleted.
    await this.db.batch([
      ...this.lexiconStatements(owner, lexicon),
      this.db.prepare('UPDATE user_state SET updated_at=? WHERE owner_id=?').bind(this.now(), owner),
    ]);
  }
  async mergeProgress(owner: string, progress: Progress[]): Promise<void> {
    const statements = this.progressStatements(owner, progress);
    if (statements.length) await this.db.batch(statements);
  }
  private progressStatements(owner: string, progress: Progress[]): D1PreparedStatement[] {
    return jsonChunks(progress).map(chunk => this.db.prepare(`INSERT INTO word_progress(owner_id,word_id,progress_json,revision)
      SELECT ?, json_extract(value,'$.wordId'), json(value), 1 FROM json_each(?) WHERE 1
      ON CONFLICT(owner_id,word_id) DO UPDATE SET progress_json=excluded.progress_json, revision=word_progress.revision+1`).bind(owner, chunk));
  }
  private lexiconStatements(owner: string, lexicon: ImportedLexicon): D1PreparedStatement[] {
    const records = [...lexicon.words.map(w => ({ id: w.id, kind: 'word', payload: w })), ...lexicon.scenes.map(s => ({ id: s.id, kind: 'scene', payload: s }))];
    return jsonChunks(records).map(chunk => this.db.prepare(`INSERT INTO custom_lexicon(owner_id,record_id,kind,payload_json)
      SELECT ?, json_extract(value,'$.id'), json_extract(value,'$.kind'), json_extract(value,'$.payload') FROM json_each(?) WHERE 1
      ON CONFLICT(owner_id,record_id,kind) DO UPDATE SET payload_json=excluded.payload_json`).bind(owner, chunk));
  }
  async restore(owner: string, lexicon: ImportedLexicon, progress: Progress[], settings: Settings, marks?: MarkSnapshot[]): Promise<void> {
    // The entire packet is committed together; omitted records are never deleted.
    await this.db.batch([
      this.db.prepare('UPDATE user_state SET settings_json=?, updated_at=? WHERE owner_id=?').bind(JSON.stringify(settings), this.now(), owner),
      ...this.lexiconStatements(owner, lexicon),
      ...this.progressStatements(owner, progress),
      ...(marks?this.markSnapshotStatements(owner,marks):[]),
    ]);
  }
  private markSnapshotStatements(owner: string, marks: MarkSnapshot[]): D1PreparedStatement[] {
    return jsonChunks(marks).map(chunk=>this.db.prepare(`INSERT INTO word_marks(owner_id,word_id,hard_count,revision,updated_at)
      SELECT ?,json_extract(value,'$.wordId'),json_extract(value,'$.hardCount'),1,? FROM json_each(?) WHERE 1
      ON CONFLICT(owner_id,word_id) DO UPDATE SET hard_count=excluded.hard_count,revision=word_marks.revision+1,updated_at=excluded.updated_at`)
      .bind(owner,this.now(),chunk));
  }
  async marks(owner: string): Promise<WordMark[]> {
    const rows=await this.db.prepare('SELECT word_id,hard_count,revision,updated_at FROM word_marks WHERE owner_id=? ORDER BY word_id').bind(owner).all<{word_id:string;hard_count:number;revision:number;updated_at:number}>();
    return (rows.results??[]).map(r=>({wordId:r.word_id,hardCount:r.hard_count,revision:r.revision,updatedAt:r.updated_at}));
  }
  async marksMany(owner: string, wordIds: string[]): Promise<Map<string,WordMark>> {
    const result=new Map(wordIds.map(id=>[id,emptyMark(id)]));
    if(!wordIds.length) return result;
    // Chunk IDs to stay below D1's 2MB bind ceiling even for full backup restores.
    for(const ids of jsonChunks(wordIds)) {
      const rows=await this.db.prepare('SELECT word_id,hard_count,revision,updated_at FROM word_marks WHERE owner_id=? AND word_id IN(SELECT value FROM json_each(?))').bind(owner,ids).all<{word_id:string;hard_count:number;revision:number;updated_at:number}>();
      for(const r of rows.results??[]) result.set(r.word_id,{wordId:r.word_id,hardCount:r.hard_count,revision:r.revision,updatedAt:r.updated_at});
    }
    return result;
  }
  async markRecords(owner: string, opIds: string[]): Promise<Map<string,MarkRecord>> {
    if(!opIds.length) return new Map();
    const rows=await this.db.prepare('SELECT op_id,word_id,delta FROM mark_operations WHERE owner_id=? AND op_id IN(SELECT value FROM json_each(?))').bind(owner,JSON.stringify(opIds)).all<{op_id:string;word_id:string;delta:1|-1}>();
    return new Map((rows.results??[]).map(r=>[r.op_id,{opId:r.op_id,wordId:r.word_id,delta:r.delta}]));
  }
  async customWordIds(owner: string, wordIds: string[]): Promise<Set<string>> {
    if(!wordIds.length) return new Set();
    const rows=await this.db.prepare("SELECT record_id FROM custom_lexicon WHERE owner_id=? AND kind='word' AND record_id IN(SELECT value FROM json_each(?))").bind(owner,JSON.stringify(wordIds)).all<{record_id:string}>();
    return new Set((rows.results??[]).map(r=>r.record_id));
  }
  async commitMarks(owner: string, operations: MarkOperation[], marks: PreparedMark[]): Promise<boolean> {
    if(!operations.length) return true;
    const token=crypto.randomUUID();const first=operations[0];const payload=JSON.stringify(operations);const snapshots=JSON.stringify(marks);
    // The first new operation claims the entire transaction only if all word
    // revisions still match and no supposedly-new operation already exists.
    const rows=await this.db.batch([
      this.db.prepare(`INSERT OR IGNORE INTO mark_operations(owner_id,op_id,word_id,delta,claim_token,created_at)
        SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE
        COALESCE((SELECT revision FROM word_marks m WHERE m.owner_id=? AND m.word_id=json_extract(j.value,'$.wordId')),0)<>json_extract(j.value,'$.expectedRevision'))
        AND NOT EXISTS(SELECT 1 FROM json_each(?) j JOIN mark_operations o ON o.owner_id=? AND o.op_id=json_extract(j.value,'$.opId'))`)
        .bind(owner,first.opId,first.wordId,first.delta,token,this.now(),snapshots,owner,payload,owner),
      this.db.prepare(`INSERT INTO mark_operations(owner_id,op_id,word_id,delta,claim_token,created_at)
        SELECT ?,json_extract(j.value,'$.opId'),json_extract(j.value,'$.wordId'),json_extract(j.value,'$.delta'),?,?
        FROM json_each(?) j WHERE json_extract(j.value,'$.opId')<>?
        AND EXISTS(SELECT 1 FROM mark_operations WHERE owner_id=? AND op_id=? AND claim_token=?)`)
        .bind(owner,token,this.now(),payload,first.opId,owner,first.opId,token),
      this.db.prepare(`INSERT INTO word_marks(owner_id,word_id,hard_count,revision,updated_at)
        SELECT ?,json_extract(j.value,'$.wordId'),json_extract(j.value,'$.hardCount'),json_extract(j.value,'$.revision'),json_extract(j.value,'$.updatedAt')
        FROM json_each(?) j WHERE EXISTS(SELECT 1 FROM mark_operations WHERE owner_id=? AND op_id=? AND claim_token=?)
        ON CONFLICT(owner_id,word_id) DO UPDATE SET hard_count=excluded.hard_count,revision=excluded.revision,updated_at=excluded.updated_at`)
        .bind(owner,snapshots,owner,first.opId,token),
    ]);
    return (rows[0].meta.changes??0)===1;
  }
  async event(owner: string, eventId: string): Promise<EventResult | null> {
    const row = await this.db.prepare('SELECT result_json FROM review_events WHERE owner_id = ? AND event_id = ?').bind(owner, eventId).first<{ result_json: string }>();
    return row ? JSON.parse(row.result_json) : null;
  }
  async progress(owner: string, wordId: string): Promise<{ progress: Progress; revision: number }> {
    const row = await this.db.prepare('SELECT progress_json, revision FROM word_progress WHERE owner_id = ? AND word_id = ?').bind(owner, wordId).first<{ progress_json: string; revision: number }>();
    return row ? { progress: JSON.parse(row.progress_json), revision: row.revision } : { progress: createProgress(wordId), revision: 0 };
  }
  async commitReview(owner: string, eventId: string, revision: number, result: EventResult): Promise<boolean> {
    const token = crypto.randomUUID();
    // D1 batch is a transaction. Only a new event at the expected progress revision
    // can claim a token; the second write is gated by that unguessable token.
    const rows = await this.db.batch([
      this.db.prepare(`INSERT OR IGNORE INTO review_events(owner_id,event_id,word_id,grade,claim_token,result_json,created_at)
        SELECT ?,?,?,?,?,?,? WHERE COALESCE((SELECT revision FROM word_progress WHERE owner_id=? AND word_id=?),0)=?`)
        .bind(owner, eventId, result.wordId, result.grade, token, JSON.stringify(result), this.now(), owner, result.wordId, revision),
      this.db.prepare(`INSERT INTO word_progress(owner_id,word_id,progress_json,revision)
        SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM review_events WHERE owner_id=? AND event_id=? AND claim_token=?)
        ON CONFLICT(owner_id,word_id) DO UPDATE SET progress_json=excluded.progress_json, revision=excluded.revision WHERE word_progress.revision=?`)
        .bind(owner, result.wordId, JSON.stringify(result.progress), revision + 1, owner, eventId, token, revision),
    ]);
    return (rows[0].meta.changes ?? 0) === 1;
  }
  async planning(owner: string, today: string, horizonDays = 10, pageSize = 0): Promise<PlanningConfig> {
    await this.db.prepare(`INSERT OR IGNORE INTO plan_config(owner_id,start_date,horizon_days,page_size,retry_after,created_at,updated_at) VALUES(?,?,?,?,0,?,?)`).bind(owner,today,horizonDays,pageSize,this.now(),this.now()).run();
    const row = await this.db.prepare('SELECT start_date,horizon_days,page_size,lease_until,retry_after FROM plan_config WHERE owner_id=?').bind(owner).first<{start_date:string;horizon_days:number;page_size:number;lease_until:number|null;retry_after:number}>();
    if (!row) throw new Error('PLANNING_STATE_UNAVAILABLE');
    return {startDate:row.start_date,horizonDays:row.horizon_days,pageSize:row.page_size,leaseUntil:row.lease_until,retryAfter:row.retry_after};
  }
  async configurePlanning(owner: string, horizonDays: number, pageSize: number): Promise<void> {
    // Existing frozen days and reservations are deliberately never discarded.
    await this.db.prepare('UPDATE plan_config SET horizon_days=?,page_size=?,updated_at=? WHERE owner_id=?').bind(horizonDays,pageSize,this.now(),owner).run();
  }
  async scheduled(owner: string): Promise<ScheduledDay[]> {
    const rows = await this.db.prepare('SELECT day,day_index,plan_json,completed_at FROM scheduled_days WHERE owner_id=? ORDER BY day_index').bind(owner).all<{day:string;day_index:number;plan_json:string;completed_at:number|null}>();
    return (rows.results ?? []).map(r=>({date:r.day,dayIndex:r.day_index,plan:JSON.parse(r.plan_json),completedAt:r.completed_at}));
  }
  async reservations(owner: string): Promise<string[]> {
    const rows = await this.db.prepare('SELECT word_id FROM reserved_words WHERE owner_id=?').bind(owner).all<{word_id:string}>();
    return (rows.results ?? []).map(r=>r.word_id);
  }
  async claimPlanning(owner: string, token: string): Promise<boolean> {
    const now=this.now();
    const r=await this.db.prepare('UPDATE plan_config SET lease_token=?,lease_until=?,updated_at=? WHERE owner_id=? AND (lease_until IS NULL OR lease_until<?) AND retry_after<=?').bind(token,now+105_000,now,owner,now,now).run();
    return (r.meta.changes ?? 0)===1;
  }
  async commitScheduled(owner: string, token: string, day: ScheduledDay, reserveWordIds: string[] = day.plan.wordIds): Promise<boolean> {
    // Global planning lease serializes inventory selection. The UNIQUE owner/word
    // reservation is a second, transactional guard even if a lease ever expires.
    const result=await this.db.batch([
      this.db.prepare(`INSERT OR IGNORE INTO scheduled_days(owner_id,day,day_index,plan_json,completed_at,created_at)
        SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM plan_config WHERE owner_id=? AND lease_token=? AND lease_until>=?)
        AND NOT EXISTS(SELECT 1 FROM json_each(?) j JOIN reserved_words r ON r.owner_id=? AND r.word_id=j.value)
        AND NOT EXISTS(SELECT 1 FROM json_each(?) j JOIN word_progress p ON p.owner_id=? AND p.word_id=j.value WHERE json_extract(p.progress_json,'$.firstLearnedOn') IS NOT NULL)`)
        .bind(owner,day.date,day.dayIndex,JSON.stringify(day.plan),day.completedAt,this.now(),owner,token,this.now(),JSON.stringify(reserveWordIds),owner,JSON.stringify(reserveWordIds),owner),
      this.db.prepare(`INSERT OR IGNORE INTO reserved_words(owner_id,word_id,day)
        SELECT ?,j.value,? FROM json_each(?) j WHERE EXISTS(SELECT 1 FROM scheduled_days WHERE owner_id=? AND day=? AND plan_json=?)
        AND EXISTS(SELECT 1 FROM plan_config WHERE owner_id=? AND lease_token=?)`)
        .bind(owner,day.date,JSON.stringify(reserveWordIds),owner,day.date,JSON.stringify(day.plan),owner,token),
      this.db.prepare('UPDATE plan_config SET lease_token=NULL,lease_until=NULL,retry_after=0 WHERE owner_id=? AND lease_token=? AND EXISTS(SELECT 1 FROM scheduled_days WHERE owner_id=? AND day=? AND plan_json=?)').bind(owner,token,owner,day.date,JSON.stringify(day.plan)),
    ]);
    return (result[0].meta.changes ?? 0)===1;
  }
  async releasePlanning(owner: string, token: string, failed=false): Promise<void> {
    await this.db.prepare('UPDATE plan_config SET lease_token=NULL,lease_until=NULL,retry_after=? WHERE owner_id=? AND lease_token=?').bind(failed?this.now()+90_000:0,owner,token).run();
  }
  async batchRecord(owner: string, batchId: string): Promise<ReviewBatchRecord|null> {
    const r=await this.db.prepare('SELECT payload_hash,result_json FROM review_batches WHERE owner_id=? AND batch_id=?').bind(owner,batchId).first<{payload_hash:string;result_json:string}>();
    return r?{payloadHash:r.payload_hash,result:JSON.parse(r.result_json)}:null;
  }
  async progressMany(owner: string, wordIds: string[]): Promise<Map<string,{progress:Progress;revision:number}>> {
    const rows=await this.db.prepare('SELECT word_id,progress_json,revision FROM word_progress WHERE owner_id=? AND word_id IN(SELECT value FROM json_each(?))').bind(owner,JSON.stringify(wordIds)).all<{word_id:string;progress_json:string;revision:number}>();
    const map=new Map((rows.results ?? []).map(r=>[r.word_id,{progress:JSON.parse(r.progress_json) as Progress,revision:r.revision}] as const));
    for(const id of wordIds) if(!map.has(id)) map.set(id,{progress:createProgress(id),revision:0});
    return map;
  }
  async commitBatch(owner: string, batchId: string, payloadHash: string, reviews: PreparedReview[], result: BatchResult, completedDate?: string): Promise<boolean> {
    const token=crypto.randomUUID();const payload=JSON.stringify(reviews);
    const rows=await this.db.batch([
      this.db.prepare(`INSERT OR IGNORE INTO review_batches(owner_id,batch_id,payload_hash,claim_token,result_json,created_at)
        SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE
        COALESCE((SELECT revision FROM word_progress p WHERE p.owner_id=? AND p.word_id=json_extract(j.value,'$.result.wordId')),0)<>json_extract(j.value,'$.revision'))
        AND NOT EXISTS(SELECT 1 FROM json_each(?) j JOIN review_events e ON e.owner_id=? AND e.event_id=json_extract(j.value,'$.eventId'))`)
        .bind(owner,batchId,payloadHash,token,JSON.stringify(result),this.now(),payload,owner,payload,owner),
      this.db.prepare(`INSERT INTO review_events(owner_id,event_id,word_id,grade,claim_token,result_json,created_at)
        SELECT ?,json_extract(j.value,'$.eventId'),json_extract(j.value,'$.result.wordId'),json_extract(j.value,'$.result.grade'),?,json_extract(j.value,'$.result'),?
        FROM json_each(?) j WHERE EXISTS(SELECT 1 FROM review_batches WHERE owner_id=? AND batch_id=? AND claim_token=?)`)
        .bind(owner,token,this.now(),payload,owner,batchId,token),
      this.db.prepare(`INSERT INTO word_progress(owner_id,word_id,progress_json,revision)
        SELECT ?,json_extract(j.value,'$.result.wordId'),json_extract(j.value,'$.result.progress'),json_extract(j.value,'$.revision')+1
        FROM json_each(?) j WHERE EXISTS(SELECT 1 FROM review_batches WHERE owner_id=? AND batch_id=? AND claim_token=?)
        ON CONFLICT(owner_id,word_id) DO UPDATE SET progress_json=excluded.progress_json,revision=excluded.revision`)
        .bind(owner,payload,owner,batchId,token),
      this.db.prepare(`INSERT OR IGNORE INTO scheduled_days(owner_id,day,day_index,plan_json,completed_at,created_at)
        SELECT ?,?,CAST(julianday(?)-julianday(start_date) AS INTEGER)+1,?,?,? FROM plan_config WHERE owner_id=?
        AND ?=1 AND julianday(?)-julianday(start_date)+1>horizon_days
        AND EXISTS(SELECT 1 FROM review_batches WHERE owner_id=? AND batch_id=? AND claim_token=?)`)
        .bind(owner,completedDate ?? '',completedDate ?? '',JSON.stringify({date:completedDate,source:'curated',title:'复习日',rationale:'新词周期结束后继续按实际学习日期复习。',notice:'本页为程序计算的复习日，非 AI 新词计划。',groups:[],wordIds:[]}),this.now(),this.now(),owner,completedDate?1:0,completedDate ?? '',owner,batchId,token),
      this.db.prepare(`UPDATE scheduled_days SET completed_at=? WHERE owner_id=? AND day=? AND completed_at IS NULL
        AND EXISTS(SELECT 1 FROM review_batches WHERE owner_id=? AND batch_id=? AND claim_token=?)`)
        .bind(this.now(),owner,completedDate ?? '',owner,batchId,token),
    ]);
    return (rows[0].meta.changes ?? 0)===1;
  }
  async plan(owner: string, day: string): Promise<PlanRecord> {
    const row = await this.db.prepare('SELECT plan_json, generations, updated_at FROM daily_plans WHERE owner_id=? AND day=?').bind(owner, day).first<{ plan_json: string | null; generations: number; updated_at: number }>();
    return row ? { plan: row.plan_json ? JSON.parse(row.plan_json) : null, generations: row.generations, updatedAt: row.updated_at } : { plan: null, generations: 0, updatedAt: 0 };
  }
  async claimPlan(owner: string, day: string, token: string, regenerate: boolean): Promise<boolean> {
    const now = this.now();
    await this.db.prepare('INSERT OR IGNORE INTO daily_plans(owner_id,day,generations,updated_at) VALUES (?,?,0,0)').bind(owner, day).run();
    const result = await this.db.prepare(`UPDATE daily_plans SET claim_token=?, locked_until=?, updated_at=?, generations=generations+1
      WHERE owner_id=? AND day=? AND generations<3 AND (locked_until IS NULL OR locked_until<?)
      AND (plan_json IS NULL OR (?=1 AND updated_at<=?))`).bind(token, now + 105_000, now, owner, day, now, regenerate ? 1 : 0, now - 60_000).run();
    return (result.meta.changes ?? 0) === 1;
  }
  async savePlan(owner: string, day: string, token: string, plan: Plan): Promise<void> {
    await this.db.prepare('UPDATE daily_plans SET plan_json=?, locked_until=NULL, claim_token=NULL WHERE owner_id=? AND day=? AND claim_token=?').bind(JSON.stringify(plan), owner, day, token).run();
  }
  async releasePlan(owner: string, day: string, token: string): Promise<void> {
    await this.db.prepare('UPDATE daily_plans SET locked_until=NULL, claim_token=NULL WHERE owner_id=? AND day=? AND claim_token=?').bind(owner, day, token).run();
  }
}

/** Each SQL JSON parameter stays well below D1's 2MB string/row ceiling. */
function jsonChunks(items: unknown[], maxBytes = 400_000): string[] {
  const chunks: string[] = []; let pieces: string[] = []; let bytes = 2;
  const encoder = new TextEncoder();
  for (const item of items) {
    const value = JSON.stringify(item); const size = encoder.encode(value).byteLength + 1;
    if (size > maxBytes) throw new Error('LEXICON_RECORD_TOO_LARGE');
    if (bytes + size > maxBytes && pieces.length) { chunks.push(`[${pieces.join(',')}]`); pieces = []; bytes = 2; }
    pieces.push(value); bytes += size;
  }
  if (pieces.length) chunks.push(`[${pieces.join(',')}]`);
  return chunks;
}
