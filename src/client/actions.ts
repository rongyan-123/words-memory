/** Explicit study actions only: showing a meaning or a timer never creates a grade. */
import type { Grade, WordMark } from '../core/index.ts';
import { effectiveGrade, queueGrade, queueMark, type AutosaveState } from './autosave.ts';
export interface StudyActionContext { date: string; canRate: boolean; serverGrade: Grade | null; exposuresToday: number; base: WordMark }
export function recordHardMark(state: AutosaveState, wordId: string, delta: 1 | -1, context: StudyActionContext): AutosaveState {
  let next=queueMark(state,wordId,delta,{base:context.base});
  if(delta===1&&context.canRate&&context.exposuresToday<3&&effectiveGrade(state,wordId,context.date,context.serverGrade)!=='forgot')next=queueGrade(next,wordId,'forgot',context.date);
  return next;
}
export function recordFamiliar(state: AutosaveState, wordId: string, context: StudyActionContext): AutosaveState {
  if(!context.canRate||context.exposuresToday>=3||effectiveGrade(state,wordId,context.date,context.serverGrade)==='remembered')return state;
  return queueGrade(state,wordId,'remembered',context.date);
}
