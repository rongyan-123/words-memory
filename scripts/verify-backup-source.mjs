#!/usr/bin/env node
/** Bundled by prepare-backup-tools.mjs. Runtime uses Node built-ins only. */
import { readSnapshotInput, readLegacyBaselineInput, readEmbeddedLegacyInput, isArchiveInput } from '../src/backup/archive.mjs';
import { compareSnapshots, canonicalize } from '../src/backup/format.mjs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
export * from '../src/backup/format.mjs';
export async function runVerifier(args = process.argv.slice(2)) {
  try {
    const options = {};
    for(let index=0;index<args.length;index+=2) {
      const flag=args[index];
      if(!['--new','--old','--legacy-baseline'].includes(flag)||!args[index+1]||Object.hasOwn(options,flag)) throw new Error('Use --new NEW.json|zip [--old OLD.json|zip] [--legacy-baseline BASELINE.json]');
      options[flag]=args[index+1];
    }
    if(!options['--new']) throw new Error('--new is required');
    const next=await readSnapshotInput(options['--new']);
    const previous=options['--old']?await readSnapshotInput(options['--old']):null;
    const previousLegacy=options['--old']?readEmbeddedLegacyInput(options['--old']):null;
    const legacy=options['--legacy-baseline']?readLegacyBaselineInput(options['--legacy-baseline']):previousLegacy;
    if(previousLegacy&&legacy&&canonicalize(previousLegacy)!==canonicalize(legacy))throw new Error('PREVIOUS_LEGACY_BASELINE_CHANGED');
    const embedded=readEmbeddedLegacyInput(options['--new']);
    if(embedded&&legacy&&canonicalize(embedded)!==canonicalize(legacy))throw new Error('EMBEDDED_LEGACY_BASELINE_CHANGED');
    if(isArchiveInput(options['--new'])&&(!embedded||!legacy))throw new Error('TRUSTED_LEGACY_BASELINE_REQUIRED');
    const report=await compareSnapshots(next,previous,legacy);
    process.stdout.write(`${JSON.stringify(report)}\n`);
    return report.decision==='reject'?2:0;
  } catch(error) {
    process.stdout.write(`${JSON.stringify({decision:'reject',reasons:[error?.code??'INPUT_ERROR'],detail:error instanceof Error?error.message:'Invalid input'})}\n`);
    return 2;
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) process.exitCode=await runVerifier();
