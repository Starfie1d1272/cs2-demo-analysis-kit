import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readBuildInfo } from './build-info.mjs';

function fixture(t, withGit = true) {
  const root = mkdtempSync(join(tmpdir(), 'dak-build-info-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '0.8.5' }));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
  if (withGit) {
    git('init'); git('add', '.');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture');
    git('tag', 'v0.8.5');
  }
  return { root, git };
}
test('clean/dirty and enabled/skipped preserve release version and identify artifact', t => {
  const { root, git } = fixture(t);
  for (const versionSync of ['enabled', 'skipped']) {
    const info = readBuildInfo(root, { versionSync });
    assert.equal(info.releaseVersion, '0.8.5');
    assert.equal(info.versionSync, versionSync);
    assert.equal(info.buildRevision, git('rev-parse', 'HEAD'));
    assert.equal(info.buildDirty, false);
    assert.match(info.artifactId, /^0\.8\.5-build-[a-f0-9]{12}$/);
  }
  writeFileSync(join(root, 'local.txt'), 'untracked');
  assert.equal(readBuildInfo(root).buildDirty, true);
  assert.match(readBuildInfo(root).artifactId, /-dirty$/);
  git('add', '.'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'next');
  assert.notEqual(readBuildInfo(root).artifactId, '0.8.5-build-' + git('rev-parse', 'v0.8.5').slice(0,12));
  writeFileSync(join(root, 'local.txt'), 'tracked change');
  assert.equal(readBuildInfo(root).buildDirty, true);
});
test('missing Git and nested unrelated repositories report unknown', t => {
  const { root } = fixture(t, false);
  assert.equal(readBuildInfo(root).buildRevision, null);
  assert.equal(readBuildInfo(root).buildDirty, null);
  assert.equal(readBuildInfo(root).artifactId, '0.8.5-build-unknown');
  const parent = fixture(t);
  const nested = join(parent.root, 'archive'); mkdirSync(nested);
  writeFileSync(join(nested, 'package.json'), '{"version":"0.8.5"}');
  assert.equal(readBuildInfo(nested).buildRevision, null);
  assert.throws(() => readBuildInfo(root, { releaseTag: 'v0.8.5' }));
});
test('release requires exact tag/manifest/clean source and retains existing artifact ID', t => {
  const { root, git } = fixture(t);
  assert.equal(readBuildInfo(root, { releaseTag: 'v0.8.5' }).artifactId, '0.8.5');
  assert.throws(() => readBuildInfo(root, { releaseTag: 'v0.8.4' }));
  writeFileSync(join(root, 'package.json'), '{"version":"0.8.5-dev.sha"}');
  assert.throws(() => readBuildInfo(root));
  writeFileSync(join(root, 'package.json'), '{"version":"0.8.5"}');
  writeFileSync(join(root, 'local.txt'), 'dirty');
  assert.throws(() => readBuildInfo(root, { releaseTag: 'v0.8.5' }));
  git('add', '.'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'changed');
  assert.throws(() => readBuildInfo(root, { releaseTag: 'v0.8.5' }));
});
