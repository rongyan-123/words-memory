import type { Word, Scene } from "../core/index.ts";

export function parseLexiconCsv(text: string): Word[] {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) { const c = text[i]; if (c === '"') { if (quoted && text[i+1] === '"') { cell += '"'; i++; } else quoted = !quoted; } else if (c === "," && !quoted) { row.push(cell); cell = ""; } else if ((c === "\n" || c === "\r") && !quoted) { if (c === "\r" && text[i+1] === "\n") i++; row.push(cell); if (row.some(x => x.trim())) rows.push(row); row = []; cell = ""; } else cell += c; }
  if (quoted) throw new Error("CSV 双引号未闭合"); row.push(cell); if (row.some(x => x.trim())) rows.push(row);
  const headers = rows.shift()?.map(x => x.trim()) || []; if (!headers.includes("term") || !headers.includes("meaning")) throw new Error("CSV 缺少 term 或 meaning 列");
  return rows.map((r, i) => { const o = Object.fromEntries(headers.map((h, j) => [h, (r[j] || "").trim()])); return { id: o.id || `import-${stableHash(o.term.toLowerCase())}`, term: o.term, meaning: o.meaning, phonetic: o.phonetic || undefined, partOfSpeech: o.partOfSpeech || undefined, example: o.example || undefined, exampleZh: o.exampleZh || undefined, tags: (o.tags || "").split("|").filter(Boolean), sceneIds: (o.sceneIds || "").split("|").filter(Boolean), source: o.source || undefined }; });
}
export function stableHash(input: string) { let hash = 2166136261; for (const c of input) { hash ^= c.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(36); }

export function csvScenes(words: Word[]): Scene[] { const ids = [...new Set(words.flatMap(w => w.sceneIds))]; return ids.map(id => ({id,title:id,description:"从 CSV 词库导入的场景",wordIds:words.filter(w => w.sceneIds.includes(id)).map(w => w.id)})); }
