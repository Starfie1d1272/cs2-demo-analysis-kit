import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('workflow repair preserves original version selection and actual checkout; changed versions fail closed', t => {
  const root = mkdtempSync(join(tmpdir(), 'dak-version-selection-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.test');
  mkdirSync(join(root, 'scripts')); copyFileSync(new URL('./reconcile-npm-publish.mjs', import.meta.url), join(root, 'scripts/reconcile-npm-publish.mjs'));
  function version(name, value) {
    mkdirSync(join(root, 'packages', name), { recursive: true });
    writeFileSync(join(root, 'packages', name, 'package.json'), JSON.stringify({ name: `@cs2dak/${name}`, version: value, publishConfig: { access: 'public' } }));
  }
  function commit(message) { git('add', '.'); git('commit', '-m', message); return git('rev-parse', 'HEAD'); }
  version('core', '1.0.0'); version('maps', '1.0.0'); commit('initial versions');
  version('core', '2.0.0'); version('maps', '1.1.0'); const selection = commit('Changesets versions');
  writeFileSync(join(root, 'build-order.txt'), 'serial'); const checkout = commit('workflow repair only');
  const run = (...args) => spawnSync(process.execPath, ['scripts/reconcile-npm-publish.mjs', '--check-only', ...args], { cwd: root, encoding: 'utf8' });
  assert.notEqual(run().status, 0);
  const result = run('--release-commit', selection);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(`version selection commit: ${selection}`));
  assert.ok(result.stdout.includes(`release commit: ${checkout}`));
  assert.ok(result.stdout.includes('@cs2dak/core@2.0.0') && result.stdout.includes('@cs2dak/maps@1.1.0'));
  assert.equal(git('tag'), '');
  version('core', '3.0.0'); commit('unexpected version advance');
  const changed = run('--release-commit', selection);
  assert.notEqual(changed.status, 0); assert.match(changed.stderr, /actual manifest differs/);
  assert.notEqual(run('--release-commit', 'HEAD').status, 0);
  assert.equal(git('tag'), '');
});

test('CI and npm exercise the same serialized build and pin the actual provenance checkout', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  assert.equal(pkg.scripts['build:serial'], 'pnpm -r --workspace-concurrency=1 --if-present build');
  const publish = readFileSync(new URL('../.github/workflows/npm-publish.yml', import.meta.url), 'utf8');
  assert.ok(publish.includes('ref: ${{ github.sha }}'));
  assert.ok(publish.includes('run: pnpm build:serial'));
  assert.ok(publish.includes('--check-only --release-commit "$RELEASE_COMMIT"'));
  assert.ok(publish.includes('run: node scripts/reconcile-npm-publish.mjs --release-commit "$RELEASE_COMMIT"'));
  assert.ok(!publish.includes('GITHUB_SHA:'));
  assert.ok(readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8').includes('Cold serial build'));
});
