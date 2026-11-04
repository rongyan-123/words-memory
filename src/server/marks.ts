import { ValidationError, type WordMark } from '../core/index.ts';
export type { WordMark } from '../core/index.ts';
/** Portable snapshots: mark metadata never changes 1/3/7-day Progress. */
export interface MarkOperation { opId: string; wordId: string; delta: 1 | -1 }
export interface MarkSnapshot { wordId: string; hardCount: number }
export interface MarkRecord extends MarkOperation {}
export interface PreparedMark extends WordMark { expectedRevision: number }
export class MarkSafetyError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code=code; }
}
const WORD_ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/;
const OP_ID=/^[A-Za-z0-9_-]{8,100}$/;
export function emptyMark(wordId: string): WordMark { return {wordId,hardCount:0,revision:0,updatedAt:0}; }
export function validateMarkOperations(value: unknown): MarkOperation[] {
  if(!value||typeof value!=='object'||Array.isArray(value)) throw new ValidationError('标记请求应为 JSON 对象');
  const raw=(value as {operations?:unknown}).operations;
  if(!Array.isArray(raw)||!raw.length||raw.length>200) throw new ValidationError('每次提交 1–200 个标记操作');
  const byId=new Map<string,MarkOperation>();
  for(const item of raw) {
    if(!item||typeof item!=='object'||Array.isArray(item)) throw new ValidationError('标记操作格式无效');
    const op=item as Record<string,unknown>;
    if(typeof op.opId!=='string'||!OP_ID.test(op.opId)) throw new ValidationError('标记操作 ID 无效');
    if(typeof op.wordId!=='string'||!WORD_ID.test(op.wordId)) throw new ValidationError('单词 ID 无效');
    if(op.delta!==1&&op.delta!==-1) throw new ValidationError('标记变化只能是 +1 或 -1');
    const operation:MarkOperation={opId:op.opId,wordId:op.wordId,delta:op.delta};
    const prior=byId.get(operation.opId);
    if(prior&&(prior.wordId!==operation.wordId||prior.delta!==operation.delta)) throw new MarkSafetyError('MARK_OPERATION_CONFLICT','同一标记操作 ID 不能用于不同单词或变化');
    // Repeated identical operation IDs in one packet are still one action.
    if(!prior) byId.set(operation.opId,operation);
  }
  return [...byId.values()];
}
export function validateMarkSnapshots(value: unknown, knownWordIds: string[]): MarkSnapshot[] {
  if(!Array.isArray(value)||value.length>20_000) throw new ValidationError('难度标记备份列表无效');
  const known=new Set(knownWordIds);const seen=new Set<string>();
  return value.map(raw=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw)) throw new ValidationError('难度标记备份格式无效');
    const mark=raw as Record<string,unknown>;
    if(typeof mark.wordId!=='string'||!WORD_ID.test(mark.wordId)||!known.has(mark.wordId)||seen.has(mark.wordId)) throw new ValidationError('难度标记包含未知或重复单词');
    if(!Number.isSafeInteger(mark.hardCount)||(mark.hardCount as number)<0) throw new ValidationError('难度计数应为非负安全整数');
    // Revision and time are server-local metadata, not restored authority.
    if(mark.revision!==undefined&&(!Number.isSafeInteger(mark.revision)||(mark.revision as number)<0)) throw new ValidationError('难度标记版本无效');
    if(mark.updatedAt!==undefined&&(!Number.isSafeInteger(mark.updatedAt)||(mark.updatedAt as number)<0)) throw new ValidationError('难度标记更新时间无效');
    seen.add(mark.wordId);return {wordId:mark.wordId,hardCount:mark.hardCount as number};
  });
}
/** Apply the physical tap order; duplicates must have been removed by op ID first. */
export function prepareMarkOperations(current: Map<string,WordMark>, operations: MarkOperation[], updatedAt: number): PreparedMark[] {
  const results=new Map<string,PreparedMark>();
  for(const op of operations) {
    const old=results.get(op.wordId)??{...(current.get(op.wordId)??emptyMark(op.wordId)),expectedRevision:current.get(op.wordId)?.revision??0};
    if(!Number.isSafeInteger(old.hardCount)||old.hardCount<0||!Number.isSafeInteger(old.revision)||old.revision<0) throw new MarkSafetyError('MARK_STATE_INVALID','已保存标记状态无效，请先保留备份再联系维护');
    const hardCount=Math.max(0,old.hardCount+op.delta);const revision=old.revision+1;
    if(!Number.isSafeInteger(hardCount)) throw new MarkSafetyError('MARK_COUNT_OVERFLOW','计数已达到安全整数边界，本批操作未写入');
    if(!Number.isSafeInteger(revision)) throw new MarkSafetyError('MARK_REVISION_OVERFLOW','标记版本已达到安全整数边界，本批操作未写入');
    results.set(op.wordId,{...old,hardCount,revision,updatedAt:Math.max(updatedAt,old.updatedAt)});
  }
  return [...results.values()];
}
