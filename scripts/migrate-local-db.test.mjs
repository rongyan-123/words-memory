import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { localMigrationInvocation, projectRoot } from './migrate-local-db.mjs';

const readJson = (name) => JSON.parse(readFileSync(path.join(projectRoot, name), 'utf8'));

test('local migration command fixes the config, state path, binding and local mode', () => {
  const invocation = localMigrationInvocation([], {});
  assert.equal(invocation.command, process.execPath);
  assert.deepEqual(invocation.args, [
    path.join(projectRoot, 'node_modules/wrangler/bin/wrangler.js'),
    'd1', 'migrations', 'apply', 'DB', '--local',
    '--config', path.join(projectRoot, 'wrangler.local.json'),
    '--persist-to', path.join(projectRoot, '.wrangler/state'),
  ]);
  assert.equal(invocation.options.cwd, projectRoot);
  assert.ok(!invocation.args.includes('--remote'));
});

test('arbitrary flags cannot select remote resources, environments, or other state', () => {
  for (const args of [
    ['--remote'], ['--env', 'production'], ['--config', '/tmp/other.json'],
    ['--persist-to', '/tmp/other-state'], ['--local=false'], ['--help'],
  ]) {
    assert.throws(() => localMigrationInvocation(args, {}), /accepts no arguments/);
  }
});

test('Wrangler telemetry is off and tool state stays inside ignored local state', () => {
  const invocation = localMigrationInvocation([], {
    WRANGLER_SEND_METRICS: 'true', WRANGLER_LOG_PATH: '/outside',
    WRANGLER_REGISTRY_PATH: '/outside', MINIFLARE_REGISTRY_PATH: '/outside',
  });
  const env = invocation.options.env;
  assert.equal(env.CLOUDFLARE_CF_FETCH_ENABLED, 'false');
  assert.equal(env.WRANGLER_SEND_METRICS, 'false');
  assert.equal(env.WRANGLER_WRITE_LOGS, 'false');
  assert.equal(env.WRANGLER_LOG_PATH, path.join(projectRoot, '.wrangler/logs'));
  assert.equal(env.WRANGLER_REGISTRY_PATH, path.join(projectRoot, '.wrangler/dev-registry'));
  assert.equal(env.MINIFLARE_REGISTRY_PATH, path.join(projectRoot, '.wrangler/registry'));
});

test('local migration configuration agrees with the existing full UI preview', () => {
  const db = readJson('wrangler.local.json').d1_databases[0];
  assert.equal(db.binding, readJson('.openai/hosting.json').d1);
  const vite = readFileSync(path.join(projectRoot, 'vite.config.ts'), 'utf8');
  assert.ok(vite.includes(db.database_id));
  assert.ok(vite.includes(`database_name: "${db.database_name}"`));
  assert.equal(db.migrations_dir, './drizzle');
  assert.equal(db.migrations_table, 'd1_migrations');
  const migrations = readdirSync(path.join(projectRoot, db.migrations_dir)).filter((name) => name.endsWith('.sql'));
  assert.ok(migrations.length >= 3);
  assert.ok(migrations.every((name) => /^\d{4}_[a-z_]+\.sql$/.test(name)));
});

test('package root metadata and direct build dependency agree with the lockfile', () => {
  const pkg = readJson('package.json');
  const lock = readJson('package-lock.json');
  assert.equal(lock.name, pkg.name);
  assert.equal(lock.packages[''].name, pkg.name);
  assert.deepEqual(lock.packages[''].engines, pkg.engines);
  assert.deepEqual(lock.packages[''].devDependencies, pkg.devDependencies);
  assert.equal(pkg.devDependencies.esbuild, lock.packages['node_modules/esbuild'].version);
  assert.match(pkg.scripts['start:node'], /--env-file-if-exists=\.env/);
  assert.equal(readFileSync(path.join(projectRoot, '.nvmrc'), 'utf8'),
    readFileSync(path.join(projectRoot, '.node-version'), 'utf8'));
});

test('local runtime config does not require a writable global home directory', () => {
  const runtimeRoot = path.join(projectRoot, '.sites-runtime');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import './scripts/sites-env.mjs'; console.log(process.env.XDG_CONFIG_HOME);`], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, XDG_CONFIG_HOME: '', SITES_RUNTIME_ROOT: runtimeRoot },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), path.join(runtimeRoot, 'config'));
});
