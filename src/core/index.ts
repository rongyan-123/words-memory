/** Portable vocabulary domain: dates are calendar dates in Asia/Shanghai, not UTC durations. */
export const TIMEZONE = 'Asia/Shanghai' as const;
export const REVIEW_OFFSETS = [1, 3, 7] as const;
export const MAX_DAILY_EXPOSURES = 3;
export type Grade = 'remembered' | 'fuzzy' | 'forgot';
export type MemoryStatus = 'new' | 'learning' | 'review' | 'solid';
export interface Word {
  id: string;
  term: string;
  meaning: string;
  phonetic?: string;
  partOfSpeech?: string;
  example?: string;
  exampleZh?: string;
  tags: string[];
  sceneIds: string[];
  source?: string;
}
export interface Scene {
  id: string;
  title: string;
  description: string;
  wordIds: string[];
  task?: string;
}
export interface Settings {
  goalDate: string;
  dailyMinutes: number;
  newWordSeconds: number;
  reviewWordSeconds: number;
  timezone: typeof TIMEZONE;
  /** Rolling horizon and UI pagination only; never an AI word-count quota. */
  horizonDays?: number;
  pageSize?: number;
}
export interface Progress {
  wordId: string;
  firstLearnedOn: string | null;
  stage: 0 | 1 | 2 | 3;
  nextDueOn: string | null;
  lastReviewedOn: string | null;
  lastExposureOn: string | null;
  exposuresToday: number;
  lastGrade: Grade | null;
}
/** Independent user difficulty marker; never a memory grade or exposure count. */
export interface WordMark {
  wordId: string;
  hardCount: number;
  revision: number;
  updatedAt: number;
}
export interface ReviewEvent {
  id: string;
  wordId: string;
  grade: Grade;
  occurredAt: string;
}
export interface NewWordRange {
  min: number;
  max: number;
  target: number;
  capacity: number;
  remaining: number;
  daysLeft: number;
  reviewMinutes: number;
  reason: string;
}
export interface PlanGroup {
  sceneId: string;
  title: string;
  task: string;
  wordIds: string[];
}
export interface Plan {
  date: string;
  source: 'ai' | 'curated';
  title: string;
  rationale: string;
  notice: string;
  groups: PlanGroup[];
  wordIds: string[];
  aiUsage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  aiModel?: string;
  aiReasoning?: 'low';
  aiFailure?: { code: string; httpStatus?: number; finishReason?: string; contentChars?: number; completionTokens?: number; reasoningTokens?: number; validationCode?: string };
}
/** Semantic selection contains no date, quota or memory-state mutation. */
export type SemanticSelection = Omit<Plan, 'date'>;
export type DayStatus = 'missing' | 'planning' | 'ready' | 'error';
export interface DaySummary {
  date: string;
  day: number;
  dayNumber?: number;
  status: DayStatus;
  newCount: number;
  reviewCount: number;
  completed: boolean;
  plan?: Plan | null;
}
export interface DayList {
  day: number;
  dayNumber?: number;
  date: string;
  isToday: boolean;
  isFuture: boolean;
  status: DayStatus;
  plan: Plan | null;
  newWordIds: string[];
  reviewWordIds: string[];
  wordIds: string[];
  words: Word[];
  progress: Progress[];
  reviewPreview: boolean;
  canRate: boolean;
  pageSize: number;
}
export interface PlanningState {
  startDate: string;
  horizonDays: number;
  pageSize: number;
  currentDay: number;
  currentBatch: [number, number];
  days: DaySummary[];
}
export class ValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'ValidationError'; }
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,99}$/;
const DAY_MS = 86_400_000;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function dateKey(value: Date | string | number = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new ValidationError('日期无效');
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function addDays(day: string, amount: number): string {
  if (!isDateKey(day) || !Number.isInteger(amount)) throw new ValidationError('日历日期或天数无效');
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + amount * DAY_MS).toISOString().slice(0, 10);
}
export function daysBetween(from: string, to: string): number {
  if (!isDateKey(from) || !isDateKey(to)) throw new ValidationError('日历日期无效');
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}
export function defaultSettings(today = dateKey()): Settings {
  return { goalDate: addDays(today, 30), dailyMinutes: 20, newWordSeconds: 45, reviewWordSeconds: 15, timezone: TIMEZONE, horizonDays: 10, pageSize: 0 };
}
export function validateSettings(value: unknown): Settings {
  const x = record(value, '计划设置');
  if (!isDateKey(x.goalDate)) throw new ValidationError('目标日期无效');
  return {
    goalDate: x.goalDate,
    dailyMinutes: boundedNumber(x.dailyMinutes, 5, 180, '每日分钟数'),
    newWordSeconds: boundedNumber(x.newWordSeconds ?? 45, 10, 180, '新词用时'),
    reviewWordSeconds: boundedNumber(x.reviewWordSeconds ?? 15, 3, 60, '复习用时'),
    timezone: TIMEZONE,
    horizonDays: boundedInteger(x.horizonDays ?? 10, 1, 365, '计划天数'),
    pageSize: boundedInteger(x.pageSize ?? 0, 0, 200, '每页词数'),
  };
}
export function createProgress(wordId: string): Progress {
  return { wordId, firstLearnedOn: null, stage: 0, nextDueOn: null, lastReviewedOn: null, lastExposureOn: null, exposuresToday: 0, lastGrade: null };
}
export function memoryStatus(progress: Progress | undefined): MemoryStatus {
  if (!progress?.firstLearnedOn) return 'new';
  if (progress.stage === 3) return 'solid';
  return progress.stage === 0 || progress.lastGrade !== 'remembered' ? 'learning' : 'review';
}
/** Only the first spaced attempt on a day can advance a stage; weak wheel repeats never do. */
export function applyGrade(current: Progress, grade: Grade, today = dateKey()): { progress: Progress; applied: boolean; reason: 'applied' | 'daily_limit' } {
  if (!isDateKey(today)) throw new ValidationError('学习日期无效');
  if (!isGrade(grade)) throw new ValidationError('记忆评分无效');
  if ((current.firstLearnedOn && today < current.firstLearnedOn) || (current.lastExposureOn && today < current.lastExposureOn)) throw new ValidationError('学习日期不能早于已有进度');
  const exposures = current.lastExposureOn === today ? current.exposuresToday : 0;
  if (exposures >= MAX_DAILY_EXPOSURES) return { progress: { ...current }, applied: false, reason: 'daily_limit' };
  const p: Progress = { ...current, lastExposureOn: today, exposuresToday: exposures + 1, lastGrade: grade };
  if (!p.firstLearnedOn) {
    p.firstLearnedOn = today;
    p.stage = 0;
    p.nextDueOn = addDays(today, 1);
    p.lastReviewedOn = today;
  } else if (p.lastReviewedOn !== today && p.nextDueOn !== null && p.nextDueOn <= today) {
    p.lastReviewedOn = today;
    if (grade === 'remembered') {
      p.stage = Math.min(3, p.stage + 1) as Progress['stage'];
      p.nextDueOn = p.stage === 3 ? null : later(addDays(p.firstLearnedOn, REVIEW_OFFSETS[p.stage]), addDays(today, 1));
    } else {
      p.nextDueOn = addDays(today, 1);
    }
  } else if (grade !== 'remembered') {
    // Weak same-session repeats do not erase passed stages, but always leave a next-day check.
    if (p.stage === 3) p.stage = 2;
    p.nextDueOn = addDays(today, 1);
  }
  return { progress: p, applied: true, reason: 'applied' };
}
export function dueProgress(progress: Progress[], today = dateKey()): Progress[] {
  if (!isDateKey(today)) throw new ValidationError('学习日期无效');
  const unique = new Map<string, Progress>();
  for (const p of progress) {
    if (p.firstLearnedOn && p.nextDueOn && p.nextDueOn <= today && p.lastReviewedOn !== today && p.stage < 3 && !unique.has(p.wordId)) unique.set(p.wordId, p);
  }
  return [...unique.values()].sort((a, b) => a.nextDueOn!.localeCompare(b.nextDueOn!) || a.wordId.localeCompare(b.wordId));
}
export function canRepeat(progress: Progress, today = dateKey()): boolean {
  return progress.lastGrade !== 'remembered' && (progress.lastExposureOn !== today || progress.exposuresToday < MAX_DAILY_EXPOSURES);
}
/** The range is a recommendation, not a fixed quota; reviews consume the budget first. */
export function calculateNewWordRange(input: { remaining: number; dueCount: number; settings: Settings; today?: string; groupSizes?: number[] }): NewWordRange {
  const today = input.today ?? dateKey();
  if (!isDateKey(today)) throw new ValidationError('学习日期无效');
  const s = validateSettings(input.settings);
  const remaining = Math.max(0, Math.floor(finite(input.remaining, 0)));
  const due = Math.max(0, Math.floor(finite(input.dueCount, 0)));
  const daysLeft = Math.max(1, daysBetween(today, s.goalDate) + 1);
  const reviewSeconds = due * s.reviewWordSeconds;
  const budget = Math.max(0, s.dailyMinutes * 60 - reviewSeconds);
  // 35% headroom for reveal/retry transitions; the UI can stop at a coherent group boundary.
  const capacity = Math.min(60, remaining, Math.max(0, Math.floor(budget / (s.newWordSeconds * 1.35))));
  const pace = Math.max(1, Math.ceil(remaining / daysLeft));
  const target = Math.min(capacity, pace);
  const min = target === 0 ? 0 : Math.max(1, Math.floor(target * 0.75));
  let max = target === 0 ? 0 : Math.min(capacity, Math.max(target, Math.ceil(target * 1.35), Math.min(capacity, 6)));
  // Let a coherent scenario widen the recommendation, but never exceed the time budget.
  const fittingGroup = (input.groupSizes ?? []).filter(size => Number.isInteger(size) && size >= target && size > 0 && size <= capacity).sort((a, b) => a - b)[0];
  if (target > 0 && fittingGroup !== undefined) max = Math.max(max, fittingGroup);
  return {
    min, max, target, capacity, remaining, daysLeft, reviewMinutes: Math.round(reviewSeconds / 6) / 10,
    reason: capacity === 0 ? (remaining === 0 ? '词库的新词已学完，今天专注复习。' : '到期复习已占满今日时间，先稳住旧词。')
      : pace > capacity ? '按复习负载与时间预算收缩新词；目标日期可能需要延后。' : '按目标日期安排节奏，在完整情境边界灵活收尾。',
  };
}
/** Curated scenes are honest non-AI fallback; order within a scenario retains task cohesion. */
export function buildFallbackPlan(input: { words: Word[]; scenes: Scene[]; availableWordIds: string[]; range: Pick<NewWordRange, 'min' | 'max'>; date?: string }): Plan {
  const day = input.date ?? dateKey();
  const allowed = new Set(input.availableWordIds);
  const wordMap = new Map(input.words.map(w => [w.id, w]));
  const cap = Math.min(60, Math.max(0, Math.floor(input.range.max)), allowed.size);
  const target = Math.min(cap, Math.max(0, Math.ceil((input.range.min + input.range.max) / 2)));
  const chosen = new Set<string>();
  const groups: PlanGroup[] = [];
  const candidates = input.scenes.map((s, index) => ({ s, index, ids: [...new Set(s.wordIds)].filter(id => allowed.has(id) && wordMap.has(id)) }))
    .filter(x => x.ids.length);
  let fragmented = false;
  while (chosen.size < target && chosen.size < cap) {
    const room = cap - chosen.size;
    const fitting = candidates.map(candidate => ({ ...candidate, fresh: candidate.ids.filter(id => !chosen.has(id)) }))
      .filter(candidate => candidate.fresh.length > 0 && candidate.fresh.length <= room)
      .sort((a, b) => b.fresh.length - a.fresh.length || a.index - b.index);
    const next = fitting[0];
    if (!next) break;
    groups.push({ sceneId: next.s.id, title: next.s.title, task: next.s.task ?? next.s.description, wordIds: next.fresh });
    next.fresh.forEach(id => chosen.add(id));
  }
  // A scene is segmented only when no complete remaining scene fits the whole budget.
  if (chosen.size === 0 && cap > 0 && candidates.length > 0 && candidates.every(candidate => candidate.ids.length > cap)) {
    const next = [...candidates].sort((a, b) => a.ids.length - b.ids.length || a.index - b.index)[0];
    const picked = next.ids.slice(0, cap);
    fragmented = true;
    groups.push({ sceneId: next.s.id, title: `${next.s.title} · 任务片段`, task: `时间预算分阶段：本次推进 ${picked.length}/${next.ids.length} 个待学词；后续继续同一情境。${next.s.task ?? next.s.description}`, wordIds: picked });
    picked.forEach(id => chosen.add(id));
  }
  const assigned = new Set(candidates.flatMap(candidate => candidate.ids));
  const leftovers = [...allowed].filter(id => wordMap.has(id) && !assigned.has(id) && !chosen.has(id));
  if (chosen.size < target && leftovers.length) {
    const picked = leftovers.slice(0, target - chosen.size);
    groups.push({ sceneId: 'imported', title: '我的补充词库', task: '把这些词放回各自的真实使用语境。', wordIds: picked });
    picked.forEach(id => chosen.add(id));
  }
  return {
    date: day, source: 'curated',
    notice: fragmented ? '当前使用精选情境，未调用 AI。完整情境超出本次时间预算，已按任务片段分阶段推进。' : '当前使用精选情境，未调用 AI；按完整可用情境收尾，不为凑数拆词。',
    title: groups[0]?.title ?? '今天先复习',
    rationale: '精选情境计划 · 非 AI 生成。' + (groups.length ? fragmented ? '保留同一情境，按时间预算分阶段学习。' : '用一组连贯任务快速过词，不为凑数打散场景。' : ''),
    groups, wordIds: [...chosen],
  };
}

export function validateAIPlan(value: unknown, input: { availableWordIds: string[]; scenes: Scene[]; range: Pick<NewWordRange, 'min' | 'max'>; date?: string }): Plan {
  const x = record(value, 'AI 计划');
  const title = text(x.title, 2, 80, 'AI 标题');
  const rationale = text(x.rationale, 2, 500, 'AI 说明');
  if (!Array.isArray(x.groups) || x.groups.length > 12) throw new ValidationError('AI 情境数量无效');
  const allowed = new Set(input.availableWordIds);
  const sceneIds = new Set(input.scenes.map(s => s.id));
  const sceneWords = new Map(input.scenes.map(s => [s.id, new Set(s.wordIds)]));
  const assignedWords = new Set(input.scenes.flatMap(s => s.wordIds));
  const seen = new Set<string>();
  const groups = x.groups.map((item, index): PlanGroup => {
    const g = record(item, `AI 情境 ${index + 1}`);
    const sceneId = text(g.sceneId, 1, 100, 'AI 情境 ID');
    if (!sceneIds.has(sceneId) && sceneId !== 'imported') throw new ValidationError('AI 返回未知情境');
    if (!Array.isArray(g.wordIds) || g.wordIds.length === 0 || g.wordIds.length > 60) throw new ValidationError('AI 情境词数无效');
    const ids = g.wordIds.map(id => {
      if (typeof id !== 'string' || !allowed.has(id)) throw new ValidationError('AI 返回不可用词 ID');
      if (seen.has(id)) throw new ValidationError('AI 返回重复词 ID');
      if (sceneId === 'imported' ? assignedWords.has(id) : !sceneWords.get(sceneId)!.has(id)) throw new ValidationError('AI 情境包含无关单词');
      seen.add(id); return id;
    });
    return { sceneId, title: text(g.title, 2, 80, 'AI 情境标题'), task: text(g.task, 2, 500, 'AI 情境任务'), wordIds: ids };
  });
  const max = Math.min(60, Math.max(0, Math.floor(input.range.max)));
  const min = Math.min(max, Math.max(0, Math.floor(input.range.min)), allowed.size);
  if (seen.size > max || seen.size < min) throw new ValidationError('AI 返回词数不在今日区间');
  if (seen.size > 0 && groups.length === 0) throw new ValidationError('AI 计划缺少情境');
  return { date: input.date ?? dateKey(), source: 'ai', notice: 'AI 已按可用词库编排情境；记忆进度由固定规则管理。', title, rationale, groups, wordIds: [...seen] };
}
/** The sole selection ceiling is a transport/safety bound, not a daily target. */
export function validateSemanticSelection(value: unknown, input: { availableWordIds: string[]; scenes: Scene[]; maxWords?: number }): SemanticSelection {
  const x = record(value, 'AI 语义分组');
  const title = text(x.title, 2, 80, 'AI 标题');
  const rationale = text(x.rationale, 2, 500, 'AI 说明');
  const safetyMax = boundedInteger(input.maxWords ?? 200, 1, 200, '语义响应安全上限');
  if (!Array.isArray(x.groups) || x.groups.length > 40) throw new ValidationError('AI 情境数量无效');
  const allowed = new Set(input.availableWordIds);
  const sceneWords = new Map(input.scenes.map(scene => [scene.id, new Set(scene.wordIds)]));
  const assigned = new Set(input.scenes.flatMap(scene => scene.wordIds));
  const selected = new Set<string>();
  const groups = x.groups.map((raw, index): PlanGroup => {
    const group = record(raw, `AI 情境 ${index + 1}`);
    const sceneId = text(group.sceneId, 1, 100, 'AI 情境 ID');
    if (!sceneWords.has(sceneId) && sceneId !== 'imported') throw new ValidationError('AI 返回未知情境');
    if (!Array.isArray(group.wordIds) || group.wordIds.length === 0 || group.wordIds.length > safetyMax) throw new ValidationError('AI 情境词数超过安全上限或为空');
    const wordIds = group.wordIds.map(id => {
      if (typeof id !== 'string' || !allowed.has(id)) throw new ValidationError('AI 返回不可用词 ID');
      if (selected.has(id)) throw new ValidationError('AI 返回重复词 ID');
      if (sceneId === 'imported' ? assigned.has(id) : !sceneWords.get(sceneId)!.has(id)) throw new ValidationError('AI 情境包含无关单词');
      selected.add(id);
      if (selected.size > safetyMax) throw new ValidationError('AI 语义响应超过安全上限');
      return id;
    });
    return { sceneId, title: text(group.title, 2, 80, 'AI 情境标题'), task: text(group.task, 2, 500, 'AI 情境任务'), wordIds };
  });
  if (allowed.size > 0 && selected.size === 0) throw new ValidationError('AI 语义分组没有选择可用词');
  return { source: 'ai', title, rationale, notice: 'AI 按完整语义任务选词；数量由内容自然形成，不受每日分钟数或分页大小限制。', groups, wordIds: [...selected] };
}
/** Honest offline fallback: reserve one whole curated task, independent of any daily quota. */
export function buildSemanticFallback(input: { words: Word[]; scenes: Scene[]; availableWordIds: string[] }): SemanticSelection {
  const known = new Set(input.words.map(word => word.id));
  const available = new Set(input.availableWordIds.filter(id => known.has(id)));
  const candidates = input.scenes.map(scene => ({ scene, ids: [...new Set(scene.wordIds)].filter(id => available.has(id)) })).filter(item => item.ids.length);
  const next = candidates.find(item => item.ids.length <= 200) ?? candidates[0];
  const groups: PlanGroup[] = [];
  let fragmented = false;
  if (next) {
    fragmented = next.ids.length > 200;
    const wordIds = next.ids.slice(0, 200);
    groups.push({ sceneId: next.scene.id, title: next.scene.title + (fragmented ? ' · 任务片段' : ''), task: (fragmented ? '受单次响应 200 词安全上限影响，本情境分阶段推进。' : '') + (next.scene.task ?? next.scene.description), wordIds });
  } else if (available.size) {
    const wordIds = [...available].slice(0, 200);
    groups.push({ sceneId: 'imported', title: '我的补充词库', task: '原词库未提供情境；这些词尚未经过 AI 语义分组。', wordIds });
  }
  return {
    source: 'curated', title: groups[0]?.title ?? '新词已学完',
    rationale: '精选情境，非 AI 生成；按实际可用语义组安排，不以分钟数或页数裁剪。',
    notice: '当前为精选情境计划（非 AI）。' + (fragmented ? '完整情境超过单次响应安全上限，已明确分阶段。' : ''),
    groups, wordIds: groups.flatMap(group => group.wordIds),
  };
}
/** New reservations remain distinct from real learning. Return only the current three-day window. */
export function rollingBatch(today: string, startDate: string, horizonDays: number, completedDayNumbers: number[] = []): [number, number] {
  const horizon = boundedInteger(horizonDays, 1, 365, '计划天数');
  const actual = Math.max(1, daysBetween(startDate, today) + 1);
  const current = Math.min(horizon, actual);
  let start = Math.floor((current - 1) / 3) * 3 + 1;
  let end = Math.min(horizon, start + 2);
  const completed = new Set(completedDayNumbers.filter(day => Number.isInteger(day) && day >= 1 && day <= horizon));
  while (end < horizon && completed.has(end)) { start = end + 1; end = Math.min(horizon, start + 2); }
  return [start, end];
}
/** Stable new-first display order; due-review overlap appears once, never as a second memory write. */
export function uniqueDayWordIds(newIds: string[], reviewIds: string[]): string[] {
  const seen = new Set<string>();
  for (const id of [...newIds, ...reviewIds]) { identifier(id, '单词 ID'); seen.add(id); }
  return [...seen];
}

/** Existing IDs must come from trusted server ownership context, never the JSON payload. */
export function validateLexiconImport(value: unknown, knownWordIds: readonly string[] = []): { words: Word[]; scenes: Scene[] } {
  if (!Array.isArray(knownWordIds) || knownWordIds.length > 20_000) throw new ValidationError('可信词 ID 列表无效');
  const trustedKnown = new Set(knownWordIds.map(id => identifier(id, '可信词 ID')));
  const x = record(value, '词库');
  if (!Array.isArray(x.words) || x.words.length < 1 || x.words.length > 10_000) throw new ValidationError('一次导入 1–10000 个单词');
  const seen = new Set<string>();
  const words: Word[] = x.words.map((raw, index) => {
    const w = record(raw, `单词 ${index + 1}`);
    const id = identifier(w.id, '单词 ID');
    if (seen.has(id)) throw new ValidationError('单词 ID 重复'); seen.add(id);
    return {
      id, term: text(w.term, 1, 100, '英文单词'), meaning: text(w.meaning, 1, 500, '中文释义'),
      ...optionalText(w, 'phonetic', 100), ...optionalText(w, 'partOfSpeech', 50), ...optionalText(w, 'example', 1000), ...optionalText(w, 'exampleZh', 1000), ...optionalText(w, 'source', 500),
      tags: stringArray(w.tags ?? [], 20, 100, '标签'), sceneIds: stringArray(w.sceneIds ?? [], 20, 100, '情境 ID'),
    };
  });
  if (x.scenes !== undefined && (!Array.isArray(x.scenes) || x.scenes.length > 1000)) throw new ValidationError('情境列表无效');
  const sceneSeen = new Set<string>();
  const scenes: Scene[] = ((x.scenes ?? []) as unknown[]).map(raw => {
    const s = record(raw, '情境');
    const id = identifier(s.id, '情境 ID');
    if (sceneSeen.has(id)) throw new ValidationError('情境 ID 重复'); sceneSeen.add(id);
    const ids = stringArray(s.wordIds, 10_000, 100, '情境词 ID');
    if (ids.some(id => !seen.has(id) && !trustedKnown.has(id))) throw new ValidationError('情境包含未知单词');
    return { id, title: text(s.title, 1, 100, '情境标题'), description: text(s.description ?? '', 0, 1000, '情境说明'), wordIds: ids, ...optionalText(s, 'task', 1000) };
  });
  const allowedScenes = new Set(scenes.map(s => s.id));
  for (const w of words) if (w.sceneIds.some(id => !allowedScenes.has(id))) throw new ValidationError('单词引用未知情境');
  return { words, scenes };
}
export function validateProgressImport(value: unknown, knownWordIds: string[]): Progress[] {
  if (!Array.isArray(value) || value.length > Math.min(20_000, new Set(knownWordIds).size)) throw new ValidationError('学习进度列表无效');
  const known = new Set(knownWordIds); const seen = new Set<string>();
  return value.map(raw => {
    const p = record(raw, '学习进度');
    const wordId = identifier(p.wordId, '单词 ID');
    if (!known.has(wordId)) throw new ValidationError('学习进度包含词库以外的单词');
    if (seen.has(wordId)) throw new ValidationError('学习进度单词重复'); seen.add(wordId);
    const firstLearnedOn = nullableDay(p.firstLearnedOn, '首次学习日期');
    const nextDueOn = nullableDay(p.nextDueOn, '下次复习日期');
    const lastReviewedOn = nullableDay(p.lastReviewedOn, '上次复习日期');
    const lastExposureOn = nullableDay(p.lastExposureOn, '上次过词日期');
    if (!Number.isInteger(p.stage) || (p.stage as number) < 0 || (p.stage as number) > 3) throw new ValidationError('复习阶段无效');
    const stage = p.stage as Progress['stage'];
    if (!Number.isInteger(p.exposuresToday) || (p.exposuresToday as number) < 0 || (p.exposuresToday as number) > MAX_DAILY_EXPOSURES) throw new ValidationError('车轮次数无效');
    if (p.lastGrade !== null && !isGrade(p.lastGrade)) throw new ValidationError('记忆评分无效');
    if (!firstLearnedOn && (stage !== 0 || nextDueOn || lastReviewedOn || lastExposureOn || p.exposuresToday || p.lastGrade)) throw new ValidationError('未学单词不能包含复习进度');
    if (firstLearnedOn && (!lastReviewedOn || !lastExposureOn || p.lastGrade === null)) throw new ValidationError('已学单词缺少学习记录');
    if (lastReviewedOn && lastExposureOn && lastReviewedOn > lastExposureOn) throw new ValidationError('复习日期不能晚于最近学习日期');
    if (firstLearnedOn && (stage === 3 ? nextDueOn !== null : nextDueOn === null)) throw new ValidationError('学习阶段与到期时间不一致');
    if (firstLearnedOn && [lastReviewedOn, lastExposureOn].some(d => d !== null && d < firstLearnedOn)) throw new ValidationError('学习日期先后不一致');
    if (firstLearnedOn && nextDueOn && nextDueOn <= firstLearnedOn) throw new ValidationError('复习日期必须晚于首次学习');
    if (stage === 3 && p.lastGrade !== 'remembered') throw new ValidationError('已掌握阶段需要记住评分');
    if (!lastExposureOn && p.exposuresToday !== 0) throw new ValidationError('车轮次数缺少日期');
    return { wordId, firstLearnedOn, nextDueOn, lastReviewedOn, lastExposureOn, stage, exposuresToday: p.exposuresToday as number, lastGrade: p.lastGrade as Grade | null };
  });
}
function later(a: string, b: string): string { return a > b ? a : b; }
function isGrade(x: unknown): x is Grade { return x === 'remembered' || x === 'fuzzy' || x === 'forgot'; }
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(`${label}格式无效`);
  return value as Record<string, unknown>;
}
function text(value: unknown, min: number, max: number, label: string): string {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) throw new ValidationError(`${label}长度无效`);
  return value.trim();
}
function identifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !ID_RE.test(value)) throw new ValidationError(`${label}格式无效`);
  return value;
}
function stringArray(value: unknown, maxItems: number, maxLength: number, label: string): string[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new ValidationError(`${label}列表无效`);
  const items = value.map(item => text(item, 1, maxLength, label));
  if (new Set(items).size !== items.length) throw new ValidationError(`${label}重复`);
  return items;
}
function boundedNumber(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new ValidationError(`${label}应在 ${min}–${max} 之间`);
  return value;
}
function boundedInteger(value: unknown, min: number, max: number, label: string): number {
  const number = boundedNumber(value, min, max, label);
  if (!Number.isInteger(number)) throw new ValidationError(`${label}应为整数`);
  return number;
}
function optionalText(value: Record<string, unknown>, key: string, max: number): Record<string, string> {
  return value[key] === undefined ? {} : { [key]: text(value[key], 0, max, key) };
}
function nullableDay(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (!isDateKey(value)) throw new ValidationError(`${label}无效`);
  return value;
}
