/** Fixed-entry ZIP transport. Runtime dependencies are Node built-ins only. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {deflateRawSync,inflateRawSync} from 'node:zlib';
export const MAX_SNAPSHOT_BYTES=16*1024*1024;
const MAX_ARCHIVE_BYTES=50*1024*1024,MAX_TOTAL_BYTES=24*1024*1024;
export const ARCHIVE_NAMES=['snapshot.json','verify-backup.mjs','restore-backup.mjs','pack-backup.mjs','README.txt','manifest.json','legacy-baseline.json'];
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
export function crc32(bytes){let c=0xffffffff;for(const byte of bytes)c=crcTable[(c^byte)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
export function digest(bytes){return createHash('sha256').update(bytes).digest('hex');}
function fail(code){throw new Error(code);}
function json(buffer){if(buffer.length>MAX_SNAPSHOT_BYTES)fail('SNAPSHOT_TOO_LARGE');let data;try{data=JSON.parse(buffer.toString('utf8'));}catch{fail('INVALID_JSON');}const compact=Buffer.byteLength(JSON.stringify(data));if(buffer.length>compact*4+4096)fail('EXCESSIVE_JSON_PADDING');return data;}
export function readZip(buffer){
 if(buffer.length>MAX_ARCHIVE_BYTES||buffer.length<22)fail('INVALID_ZIP_SIZE');
 let end=-1;for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--){if(buffer.readUInt32LE(i)===0x06054b50&&i+22+buffer.readUInt16LE(i+20)===buffer.length){end=i;break;}}
 if(end<0)fail('ZIP_DIRECTORY_MISSING');
 const count=buffer.readUInt16LE(end+10),directorySize=buffer.readUInt32LE(end+12),directoryOffset=buffer.readUInt32LE(end+16);
 if(buffer.readUInt16LE(end+4)||buffer.readUInt16LE(end+6)||buffer.readUInt16LE(end+8)!==count||count<1||count>ARCHIVE_NAMES.length||directoryOffset+directorySize!==end)fail('ZIP_LAYOUT_UNSUPPORTED');
 let cursor=directoryOffset,total=0;const entries=new Map();
 for(let i=0;i<count;i++){
  if(cursor+46>end||buffer.readUInt32LE(cursor)!==0x02014b50)fail('ZIP_DIRECTORY_INVALID');
  const flags=buffer.readUInt16LE(cursor+8),method=buffer.readUInt16LE(cursor+10),checksum=buffer.readUInt32LE(cursor+16),compressedSize=buffer.readUInt32LE(cursor+20),size=buffer.readUInt32LE(cursor+24),nameSize=buffer.readUInt16LE(cursor+28),extraSize=buffer.readUInt16LE(cursor+30),commentSize=buffer.readUInt16LE(cursor+32),offset=buffer.readUInt32LE(cursor+42);
  if(flags&1||![0,8].includes(method)||cursor+46+nameSize+extraSize+commentSize>end)fail('ZIP_ENTRY_UNSUPPORTED');
  const name=buffer.subarray(cursor+46,cursor+46+nameSize).toString('utf8');
  if(!ARCHIVE_NAMES.includes(name)||entries.has(name)||size>(name==='snapshot.json'?MAX_SNAPSHOT_BYTES:2*1024*1024))fail('ZIP_ENTRY_REJECTED');
  total+=size;if(total>MAX_TOTAL_BYTES)fail('ZIP_EXPANSION_LIMIT');
  if(offset+30>directoryOffset||buffer.readUInt32LE(offset)!==0x04034b50||buffer.readUInt16LE(offset+8)!==method)fail('ZIP_LOCAL_HEADER_INVALID');
  const localNameSize=buffer.readUInt16LE(offset+26),localExtraSize=buffer.readUInt16LE(offset+28),start=offset+30+localNameSize+localExtraSize;
  if(buffer.subarray(offset+30,offset+30+localNameSize).toString('utf8')!==name||start+compressedSize>directoryOffset)fail('ZIP_LOCAL_HEADER_MISMATCH');
  const compressed=buffer.subarray(start,start+compressedSize);let value;
  try{value=method===0?Buffer.from(compressed):inflateRawSync(compressed,{maxOutputLength:size+1});}catch{fail('ZIP_DECOMPRESSION_FAILED');}
  if(value.length!==size||crc32(value)!==checksum)fail('ZIP_CRC_MISMATCH');
  entries.set(name,value);cursor+=46+nameSize+extraSize+commentSize;
 }
 if(cursor!==end||!entries.has('snapshot.json')||!entries.has('manifest.json'))fail('ZIP_INCOMPLETE');
 const manifest=json(entries.get('manifest.json'));
 if(manifest.format!=='vocab-wheel-disaster-archive'||manifest.version!==1||!manifest.entries||typeof manifest.entries!=='object')fail('ZIP_MANIFEST_INVALID');
 for(const name of ARCHIVE_NAMES){if(name==='legacy-baseline.json'&&!entries.has(name))continue;if(!entries.has(name))fail('ZIP_REQUIRED_ENTRY_MISSING');if(name==='manifest.json')continue;const item=manifest.entries[name];if(!item||item.bytes!==entries.get(name).length||item.sha256!==digest(entries.get(name)))fail('ZIP_MANIFEST_MISMATCH');}
 const expected=[...entries.keys()].filter(name=>name!=='manifest.json').sort();if(JSON.stringify(Object.keys(manifest.entries).sort())!==JSON.stringify(expected))fail('ZIP_MANIFEST_ENTRIES_MISMATCH');
 return entries;
}
export function readSnapshotInput(path){
 const bytes=readFileSync(path);if(bytes.length>MAX_ARCHIVE_BYTES)fail('INPUT_TOO_LARGE');
 if(bytes.length>=4&&bytes.readUInt32LE(0)===0x04034b50){const entries=readZip(bytes);const snapshot=json(entries.get('snapshot.json'));const manifest=json(entries.get('manifest.json'));if(manifest.snapshotContentSha256!==snapshot.contentSha256)fail('ZIP_SNAPSHOT_HASH_MISMATCH');return snapshot;}
 return json(bytes);
}
export function createZip(entries){
 let offset=0,total=0;const locals=[],directory=[];
 for(const [name,input] of entries){if(!ARCHIVE_NAMES.includes(name))fail('ZIP_ENTRY_REJECTED');const bytes=Buffer.from(input);total+=bytes.length;if(total>MAX_TOTAL_BYTES||bytes.length>(name==='snapshot.json'?MAX_SNAPSHOT_BYTES:2*1024*1024))fail('ZIP_EXPANSION_LIMIT');const compressed=deflateRawSync(bytes,{level:6}),filename=Buffer.from(name),checksum=crc32(bytes);
  const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(0x21,12);header.writeUInt32LE(checksum,14);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(bytes.length,22);header.writeUInt16LE(filename.length,26);
  locals.push(header,filename,compressed);const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(8,10);central.writeUInt16LE(0x21,14);central.writeUInt32LE(checksum,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(bytes.length,24);central.writeUInt16LE(filename.length,28);central.writeUInt32LE(offset,42);directory.push(central,filename);offset+=header.length+filename.length+compressed.length;
 }
 const size=directory.reduce((sum,b)=>sum+b.length,0),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.size,8);end.writeUInt16LE(entries.size,10);end.writeUInt32LE(size,12);end.writeUInt32LE(offset,16);
 const archive=Buffer.concat([...locals,...directory,end]);if(archive.length>MAX_ARCHIVE_BYTES)fail('ARCHIVE_TOO_LARGE');return archive;
}

export function readEmbeddedLegacyInput(path){const bytes=readFileSync(path);if(bytes.length>MAX_ARCHIVE_BYTES)fail('INPUT_TOO_LARGE');if(bytes.length<4||bytes.readUInt32LE(0)!==0x04034b50)return null;const entries=readZip(bytes);return entries.has('legacy-baseline.json')?json(entries.get('legacy-baseline.json')):null;}
export function readLegacyBaselineInput(path){const embedded=readEmbeddedLegacyInput(path);if(embedded)return embedded;const bytes=readFileSync(path);if(bytes.length>=4&&bytes.readUInt32LE(0)===0x04034b50)fail('LEGACY_BASELINE_MISSING');return json(bytes);}
export function isArchiveInput(path){const bytes=readFileSync(path);return bytes.length>=4&&bytes.readUInt32LE(0)===0x04034b50;}
