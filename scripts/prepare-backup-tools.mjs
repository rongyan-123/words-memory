import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const names=['verify-backup','restore-backup','pack-backup'];
for(const name of names)await build({entryPoints:[`scripts/${name}-source.mjs`],outfile:`scripts/${name}.mjs`,bundle:true,platform:'node',format:'esm',target:'node24',external:['node:*'],legalComments:'none',logLevel:'warning'});
console.log(JSON.stringify({standaloneBackupTools:Object.fromEntries(names.map(name=>[`${name}.mjs`,createHash('sha256').update(readFileSync(`scripts/${name}.mjs`)).digest('hex')]))}));
