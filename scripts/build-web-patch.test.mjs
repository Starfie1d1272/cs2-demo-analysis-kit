import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { readBuildInfo } from './build-info.mjs';

const script = fileURLToPath(new URL('./build-web-patch.mjs', import.meta.url));
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'dak-web-patch-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
  writeFileSync(join(root, 'package.json'), '{"version":"0.8.5"}');
  writeFileSync(join(root, '.gitignore'), 'runtime/\noutput/\n');
  git('init'); git('add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'source');
  git('tag', 'v0.8.5');
  const snapshot = readBuildInfo(root, { releaseTag: 'v0.8.5' });
  const web = join(root, 'runtime', 'studio_web');
  mkdirSync(join(web, 'assets'), { recursive: true });
  writeFileSync(join(web, 'index.html'), '<script src="assets/app.js"></script>');
  writeFileSync(join(web, 'assets/app.js'), `console.log(${JSON.stringify(snapshot)})`);
  writeFileSync(join(web, 'build-info.json'), JSON.stringify(snapshot, null, 2) + '\n');
  return { root, web, snapshot };
}
function run(root, web) {
  // Separate process / CI step with no inherited provenance or pnpm executable.
  const env = { ...process.env, PATH: '/missing' };
  delete env.DAK_BUILD_INFO; delete env.DAK_APP_VERSION;
  return spawnSync(process.execPath, [script, '0.8.5', join(root, 'output'), web], { cwd: root, env, encoding: 'utf8' });
}
test('new CI step after downloading assets packages the same release frontend bytes', async t => {
  const { root, web, snapshot } = fixture(t);
  writeFileSync(join(root, 'tris-manifest.json'), '{"maps":{"de_nuke":{}}}');
  assert.equal(readBuildInfo(root).buildDirty, true);
  const result = run(root, web);
  assert.equal(result.status, 0, result.stderr);
  const zip = await JSZip.loadAsync(readFileSync(join(root, 'output', 'dak-studio-web-0.8.5.zip')));
  for (const file of ['index.html', 'assets/app.js', 'build-info.json']) {
    assert.deepEqual(await zip.file(file).async('nodebuffer'), readFileSync(join(web, file)));
  }
  assert.deepEqual(JSON.parse(await zip.file('build-info.json').async('string')), snapshot);
  assert.equal(JSON.parse(await zip.file('version.json').async('string')).version, '0.8.5');
  assert.equal(existsSync(join(web, 'version.json')), false);
  // Genuine new source changes remain dirty; patch still describes the previously built runtime.
  writeFileSync(join(root, 'package.json'), '{"version":"0.8.6"}');
  assert.equal(readBuildInfo(root).buildDirty, true);
});
test('missing, mismatched, dirty or ad-hoc desktop snapshots fail before artifact write', t => {
  const { root, web, snapshot } = fixture(t);
  for (const info of [
    { ...snapshot, releaseVersion: '0.8.4' },
    { ...snapshot, buildDirty: true },
    { ...snapshot, buildDirty: null },
    { ...snapshot, packageMode: 'ad-hoc' },
    { ...snapshot, buildRevision: null },
  ]) {
    writeFileSync(join(web, 'build-info.json'), JSON.stringify(info));
    assert.notEqual(run(root, web).status, 0);
    assert.equal(existsSync(join(root, 'output')), false);
  }
  rmSync(join(web, 'build-info.json'));
  assert.notEqual(run(root, web).status, 0);
  assert.equal(existsSync(join(root, 'output')), false);
});
