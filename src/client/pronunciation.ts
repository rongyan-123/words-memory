import type { Word } from '../core/index.ts';
import { pronunciationEntries } from '../data/pronunciations.ts';

export interface DisplayPronunciation {
  ipa: string;
  label: '音标' | '美' | '英';
  dialect: 'en-US' | 'en-GB' | null;
  source: string;
  from: 'lexicon' | 'reference';
  variants: readonly string[];
}

/** Presentation only: never augment/mutate the persisted lexicon or learning IDs. */
export function pronunciationFor(word: Pick<Word, 'term' | 'phonetic' | 'source'>): DisplayPronunciation | null {
  const supplied=word.phonetic?.trim();
  if(supplied)return{ipa:supplied,label:'音标',dialect:null,source:word.source||'词库提供的音标（未指定口音）',from:'lexicon',variants:[supplied]};
  const term=word.term.trim().toLowerCase();
  if(!Object.hasOwn(pronunciationEntries,term))return null;
  const entry=pronunciationEntries[term];
  return{ipa:entry.ipa,label:entry.dialect==='en-GB'?'英':'美',dialect:entry.dialect,source:entry.source,from:'reference',variants:entry.ipa.match(/\/[^/]+\//g)||[entry.ipa]};
}
