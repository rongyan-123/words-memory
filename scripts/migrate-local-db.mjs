/** Apply immutable SQL once to this checkout's local preview DB, never remote D1. */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const configPath = path.join(projectRoot, 'wrangler.local.json');
const localDatabaseId = '00000000-0000-4000-8000-000000000000';

export function localMigrationInvocation(args = [], environment = process.env) {
  // Do not forward arbitrary CLI flags: --remote, --env, --config and path
  // overrides do not belong to this local-only convenience command.
  if (args.length !== 0) {
    throw new Error('db:migrate accepts no arguments and only uses this checkout’s local DB.');
  }
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const database = config.d1_databases?.[0];
  if (config.d1_databases?.length !== 1 || database?.binding !== 'DB'
    || database.database_name !== 'site-creator-d1' || database.database_id !== localDatabaseId
    || database.migrations_dir !== './drizzle' || database.migrations_table !== 'd1_migrations'
    || config.env || database.remote || database.preview_database_id) {
    throw new Error('Unexpected local D1 configuration. Keep the placeholder DB and ./drizzle migration directory.');
  }
  return {
    command: process.execPath,
    args: [
      path.join(projectRoot, 'node_modules/wrangler/bin/wrangler.js'),
      'd1', 'migrations', 'apply', 'DB', '--local',
      '--config', configPath,
      '--persist-to', path.join(projectRoot, '.wrangler/state'),
    ],
    options: {
      cwd: projectRoot,
      stdio: 'inherit',
      env: {
        ...environment,
        CLOUDFLARE_CF_FETCH_ENABLED: 'false',
        WRANGLER_SEND_METRICS: 'false',
        WRANGLER_WRITE_LOGS: 'false',
        WRANGLER_LOG_PATH: path.join(projectRoot, '.wrangler/logs'),
        WRANGLER_REGISTRY_PATH: path.join(projectRoot, '.wrangler/dev-registry'),
        MINIFLARE_REGISTRY_PATH: path.join(projectRoot, '.wrangler/registry'),
      },
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const invocation = localMigrationInvocation(process.argv.slice(2));
    if (!existsSync(invocation.args[0])) {
      throw new Error('Local Wrangler is missing. Run npm run install:ci first.');
    }
    console.info('Applying local migrations under .wrangler/state. No remote database is used.');
    const result = spawnSync(invocation.command, invocation.args, invocation.options);
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
