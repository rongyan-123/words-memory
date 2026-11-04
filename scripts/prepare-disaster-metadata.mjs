import {readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {seedWords,seedScenes,lexiconInfo} from '../src/data/seed.ts';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?`[${value.map(canonical).join(',')}]`:`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
const hash=value=>createHash('sha256').update(value).digest('hex');
const migrations=readdirSync(join(root,'drizzle')).filter(name=>/^\d+_.+\.sql$/.test(name)).sort().map(name=>{const sql=readFileSync(join(root,'drizzle',name),'utf8');return{name,sha256:hash(sql),sql};});
const excluded=new Set(['generated','node_modules','.git','.wrangler','.sites-runtime','dist']);
const files=[];
function walk(directory,includeAll=false){for(const entry of readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){if(excluded.has(entry.name)||entry.isSymbolicLink())continue;const path=join(directory,entry.name);if(entry.isDirectory())walk(path,includeAll);else if((includeAll||/\.(?:ts|tsx|mjs|js|json|css|svg|sql|md)$/.test(entry.name))&&!entry.name.endsWith('.tsbuildinfo'))files.push({path:relative(root,path).replaceAll('\\','/'),sha256:hash(readFileSync(path))});}}
for(const name of ['app','src','db','drizzle','scripts','build'])walk(join(root,name));
// Static import data and distributed license notices are part of this release,
// not runtime secrets. Their exact bytes must also affect the code fingerprint.
walk(join(root,'public'),true);
for(const name of ['package.json','package-lock.json','tsconfig.json','vite.config.ts','next.config.ts'])files.push({path:name,sha256:hash(readFileSync(join(root,name)))});
files.sort((a,b)=>a.path.localeCompare(b.path));
const baseCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if(!/^[a-f0-9]{40}$/.test(baseCommit))throw new Error('Cannot establish source base commit');
const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
const metadata={name:'vocab-wheel',packageVersion:pkg.version,baseCommit,sourceTreeSha256:hash(canonical(files)),schemaVersion:3,migrations,seedSha256:hash(canonical({words:seedWords,scenes:seedScenes,info:lexiconInfo}))};
mkdirSync(join(root,'src/generated'),{recursive:true});
writeFileSync(join(root,'src/generated/disaster-metadata.ts'),`// Generated from allowlisted application sources and immutable migrations; no runtime environment values.\nexport const disasterMetadata = ${JSON.stringify(metadata,null,2)} as const;\n`);
console.log(JSON.stringify({disasterMetadata:'ready',sourceTreeSha256:metadata.sourceTreeSha256,baseCommit,migrations:migrations.length,seedWords:seedWords.length}));
