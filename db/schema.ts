import { check, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/** Records use the server-owned single-owner namespace; hosted access is owner-private. */
export const userState = sqliteTable('user_state', {
  ownerId: text('owner_id').primaryKey(),
  settingsJson: text('settings_json').notNull(),
  lexiconJson: text('lexicon_json').notNull().default('{"words":[],"scenes":[]}'),
  updatedAt: integer('updated_at').notNull(),
});
export const wordProgress = sqliteTable('word_progress', {
  ownerId: text('owner_id').notNull(),
  wordId: text('word_id').notNull(),
  progressJson: text('progress_json').notNull(),
  revision: integer('revision').notNull().default(1),
}, (t) => [primaryKey({ columns: [t.ownerId, t.wordId] })]);
export const reviewEvents = sqliteTable('review_events', {
  ownerId: text('owner_id').notNull(),
  eventId: text('event_id').notNull(),
  wordId: text('word_id').notNull(),
  grade: text('grade').notNull(),
  claimToken: text('claim_token').notNull(),
  resultJson: text('result_json').notNull(),
  createdAt: integer('created_at').notNull(),
}, (t) => [primaryKey({ columns: [t.ownerId, t.eventId] })]);
export const dailyPlans = sqliteTable('daily_plans', {
  ownerId: text('owner_id').notNull(),
  day: text('day').notNull(),
  planJson: text('plan_json'),
  generations: integer('generations').notNull().default(0),
  claimToken: text('claim_token'),
  lockedUntil: integer('locked_until'),
  updatedAt: integer('updated_at').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.ownerId, t.day] })]);
/** Large imported lexicons are stored as individual bounded records, not a D1 >2MB text cell. */
export const customLexicon = sqliteTable('custom_lexicon', {
  ownerId: text('owner_id').notNull(),
  recordId: text('record_id').notNull(),
  kind: text('kind').notNull(),
  payloadJson: text('payload_json').notNull(),
}, (t) => [primaryKey({ columns: [t.ownerId, t.recordId, t.kind] })]);

/** Appended v2 planning state. The deployed 0000 migration remains immutable. */
export const planConfig = sqliteTable('plan_config', {
  ownerId: text('owner_id').primaryKey(),
  startDate: text('start_date').notNull(),
  horizonDays: integer('horizon_days').notNull().default(10),
  pageSize: integer('page_size').notNull().default(0),
  leaseToken: text('lease_token'),
  leaseUntil: integer('lease_until'),
  retryAfter: integer('retry_after').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
export const scheduledDays = sqliteTable('scheduled_days', {
  ownerId: text('owner_id').notNull(),
  day: text('day').notNull(),
  dayIndex: integer('day_index').notNull(),
  planJson: text('plan_json').notNull(),
  completedAt: integer('completed_at'),
  createdAt: integer('created_at').notNull(),
}, (t) => [primaryKey({ columns: [t.ownerId, t.day] })]);
export const reservedWords = sqliteTable('reserved_words', {
  ownerId: text('owner_id').notNull(),
  wordId: text('word_id').notNull(),
  day: text('day').notNull(),
}, (t) => [primaryKey({ columns: [t.ownerId, t.wordId] })]);
export const reviewBatches = sqliteTable('review_batches', {
  ownerId: text('owner_id').notNull(),
  batchId: text('batch_id').notNull(),
  payloadHash: text('payload_hash').notNull(),
  claimToken: text('claim_token').notNull(),
  resultJson: text('result_json').notNull(),
  createdAt: integer('created_at').notNull(),
}, (t) => [primaryKey({ columns: [t.ownerId, t.batchId] })]);

/** V5 manual difficulty is independent of learning progress and review stages. */
export const wordMarks = sqliteTable('word_marks', {
  ownerId: text('owner_id').notNull(),
  wordId: text('word_id').notNull(),
  hardCount: integer('hard_count').notNull().default(0),
  revision: integer('revision').notNull().default(1),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [
  primaryKey({ columns: [t.ownerId, t.wordId] }),
  check('word_marks_count_safe', sql`typeof(${t.hardCount}) = 'integer' AND ${t.hardCount} >= 0 AND ${t.hardCount} <= 9007199254740991`),
  check('word_marks_revision_safe', sql`typeof(${t.revision}) = 'integer' AND ${t.revision} >= 1 AND ${t.revision} <= 9007199254740991`),
]);
export const markOperations = sqliteTable('mark_operations', {
  ownerId: text('owner_id').notNull(),
  opId: text('op_id').notNull(),
  wordId: text('word_id').notNull(),
  delta: integer('delta').notNull(),
  claimToken: text('claim_token').notNull(),
  createdAt: integer('created_at').notNull(),
}, (t) => [primaryKey({ columns: [t.ownerId, t.opId] }), check('mark_operations_delta_valid', sql`${t.delta} IN (-1, 1)`)]);
