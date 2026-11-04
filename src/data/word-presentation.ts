import type { Word } from '../core/index.ts';
import { seedWords } from './seed.ts';
import {
  computingCandidateWordIds, ECDICT_LICENSE_URL, ECDICT_SOURCE_URL, seedWordOverlays,
} from './lexicon-expansion.ts';

export interface WordPresentation {
  badges: string[];
  meanings: { label: string; text: string }[];
  tags: string[];
  sources: { label: string; url: string }[];
}
const seedById = new Map(seedWords.map(word => [word.id, word]));
const CC0_URL = 'https://creativecommons.org/publicdomain/zero/1.0/';
const unique = (values: readonly string[]): string[] => [...new Set(values)];
const normalizeTerm = (term: string): string => term.normalize('NFKC').trim().toLowerCase();

/** Literal source-domain splitting, not inferred technical sense generation. */
function dictionaryMeanings(text: string): { general: string; computing: string } {
  const general: string[] = [];
  const computing: string[] = [];
  for (const line of text.split('\n')) {
    // ECDICT stores domain-marked senses on their own line. If a row ever has
    // an inline marker, preserve preceding prose rather than discarding it.
    const marker = line.indexOf('[计]');
    if (marker < 0) { if (line.trim()) general.push(line.trim()); continue; }
    const before = line.slice(0, marker).trim();
    const after = line.slice(marker + '[计]'.length).trim();
    if (before) general.push(before);
    if (after) computing.push(after);
  }
  return { general: general.join('\n'), computing: computing.join('\n') };
}

/**
 * Presentation-only view. Never writes back to a Word, seed, lexicon, plan,
 * memory record, or source field. Badges distinguish exam membership evidence
 * from contextual teaching and a raw dictionary [计] candidate marker.
 */
export function wordPresentation(word: Word): WordPresentation {
  const original = seedById.get(word.id);
  const isOriginalSeed = !!original && normalizeTerm(original.term) === normalizeTerm(word.term);
  const overlay = isOriginalSeed ? seedWordOverlays[word.id] : undefined;
  const isEcdict = !!word.source?.startsWith('ECDICT @ab22ad36302c');
  const cncfMatch = word.source?.match(/https:\/\/glossary\.cncf\.io\/[a-z0-9-]+\//);
  const cncfUrl = cncfMatch?.[0];
  // Only IDs present in the approved source metadata can earn this tag; a
  // word's spelling or a freely imported [计] string does not invent evidence.
  const computingCandidate = computingCandidateWordIds.has(word.id)
    && (isOriginalSeed || isEcdict || !!cncfUrl);
  const tags = unique([
    ...word.tags,
    ...(overlay?.addTags ?? []),
    ...(isOriginalSeed ? ['technical-context'] : []),
    ...(computingCandidate ? ['computing-candidate'] : []),
  ]);
  const hasCet4 = tags.includes('cet4');
  const badges: string[] = [];
  if (hasCet4) badges.push(overlay?.cet4 || isEcdict ? '四级 · ECDICT 标签' : '四级 · 自带标签');
  if (isOriginalSeed) badges.push('原创技术场景');
  if (hasCet4 && isOriginalSeed) badges.push('四级 × 技术场景');
  if (computingCandidate) badges.push('词典 [计] 候选');
  if (cncfUrl) badges.push('CNCF 术语 · 原创简释');

  const meanings: WordPresentation['meanings'] = [];
  const addDictionary = (text: string): void => {
    const split = dictionaryMeanings(text);
    if (split.general) meanings.push({ label: '通用 / 其他义 · ECDICT', text: split.general });
    if (split.computing) meanings.push({ label: '计算机候选义 · ECDICT [计]', text: split.computing });
  };
  if (isOriginalSeed) {
    // A metadata supplement is not the frozen original card's scenario sense.
    // Keep the caller's stored wording, including runtime; do not silently
    // relabel a later CNCF teaching summary as an original example meaning.
    meanings.push({ label: '本场景义 · 原创例句', text: word.meaning });
    if (overlay?.generalMeaning) addDictionary(overlay.generalMeaning);
  } else if (isEcdict) {
    addDictionary(word.meaning);
    // Never hide source meaning if its formatting is unfamiliar or empty.
    if (!meanings.length) meanings.push({ label: '词典释义 · ECDICT', text: word.meaning });
  } else {
    meanings.push({ label: cncfUrl ? '技术简释 · 原创' : '释义', text: word.meaning });
  }

  const sources: WordPresentation['sources'] = [];
  if (isOriginalSeed) sources.push({ label: '原创场景释义与例句 · CC0-1.0', url: CC0_URL });
  if (isEcdict || overlay?.cet4 || (cncfUrl && !!word.phonetic)) {
    sources.push({ label: 'ECDICT · 词典字段 / 第三方标签', url: ECDICT_SOURCE_URL });
    sources.push({ label: 'ECDICT MIT 声明与上游来源说明', url: ECDICT_LICENSE_URL });
  }
  if (overlay?.technicalContextReference) {
    sources.push({ label: '技术语境参考 · 不代表考试义项', url: overlay.technicalContextReference });
  }
  if (cncfUrl) {
    sources.push({ label: 'CNCF 原始术语条目 · 非复制定义', url: cncfUrl });
    sources.push({ label: '原创中文简释 · CC0-1.0', url: CC0_URL });
  }
  // Unknown imported words keep their own prose and tags. An explicitly given
  // https source can be linked, but no dictionary, license or exam claim is
  // inferred from a term's spelling or an unrecognized ID.
  if (!sources.length && word.source) {
    const givenUrl = word.source.match(/https:\/\/[^\s<>"']+/)?.[0];
    if (givenUrl) sources.push({ label: '词条自带来源', url: givenUrl });
  }
  return { badges, meanings, tags, sources };
}

/** Disposable AI-selection copy; callers must not persist it as the lexicon. */
export function enrichWordForPlanning(word: Word): Word {
  const presentation = wordPresentation(word);
  const original = seedById.get(word.id);
  const isOriginalSeed = !!original && normalizeTerm(original.term) === normalizeTerm(word.term);
  const overlay = isOriginalSeed ? seedWordOverlays[word.id] : undefined;
  // The complete stored meanings remain untouched. For overlapping seed
  // entries, the model sees labeled ordinary / candidate / scenario senses
  // instead of treating a technical scenario as the sole exam meaning.
  const meaning = overlay
    ? presentation.meanings.map(section => `【${section.label}】${section.text.replace(/\s+/g, ' ')}`).join('；')
    : word.meaning;
  return {
    ...word,
    meaning,
    tags: [...presentation.tags],
    sceneIds: [...word.sceneIds],
  };
}
