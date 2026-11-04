/** V4 selection recovery is a fresh snapshot, never merged with a previous tab owner's cache. */
import { isDateKey, type Grade } from '../core/index.ts';
export const LEGACY_DRAFT_KEY='vocab-wheel-batch-draft-v2';
export function readLegacyDraft(raw:string|null,knownWordIds:readonly string[],maxDay:number):{grades:Record<string,Grade>;day:number|null;actionDate:string|null}{
 const empty=()=>({grades:{} as Record<string,Grade>,day:null,actionDate:null});
 if(!raw)return empty();
 try{const value=JSON.parse(raw);if(!value||!Number.isInteger(value.day)||value.day<1||value.day>maxDay||!value.ratings||typeof value.ratings!=='object'||Array.isArray(value.ratings))return empty();
 const known=new Set(knownWordIds);const grades=Object.fromEntries(Object.entries(value.ratings).filter(([wordId,grade])=>known.has(wordId)&&['remembered','fuzzy','forgot'].includes(grade as string))) as Record<string,Grade>;
 return {grades,day:Object.keys(grades).length?value.day:null,actionDate:isDateKey(value.date)?value.date:null};
 }catch{return empty();}
}
