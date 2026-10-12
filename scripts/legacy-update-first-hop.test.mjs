import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { transformSync } from 'esbuild';

const root = new URL('../', import.meta.url);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const legacyHashes = {
  'legacy-update-v0.8.5.txt': 'b65356745f946152fe236cee90533645a55cda757e7d946cf23eaaaf94d242a6',
  'legacy-updater-bridge-v0.8.5.txt': 'acb9068fd8a69b2c17a8bcc7d2ceef3798527d436d04b54ee97f1fe266a6052f',
};

test('stable control pointers wait for the actual legacy download page and both verified installers', () => {
  const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  const publish = workflow.indexOf('- uses: softprops/action-gh-release@');
  assert.ok(publish > 0);
  const beforeRelease = workflow.slice(0, publish);
  for (const key of ['releases/latest.json', 'releases/latest-v2.json', 'releases/install-manifest.json', 'releases/uploader/latest.json']) {
    assert.ok(!beforeRelease.includes(`s3://\${R2_BUCKET}/${key}"`), `premature stable pointer: ${key}`);
  }
  const promote = workflow.slice(workflow.indexOf('- name: Verify installer downloads then announce Studio update'));
  assert.ok(promote.indexOf('releases/latest" --jq .tag_name') < promote.indexOf('for name in install-manifest.json latest-v2.json'));
  assert.ok(promote.indexOf('public manual installer size/SHA-256 mismatch') < promote.indexOf('for name in install-manifest.json latest-v2.json'));
  assert.ok(promote.indexOf('cmp dist/uploader-manifest.json') < promote.indexOf('aws s3 cp dist/latest.json'));
});

test('actual 0.8.5 client reads real-version manual manifest; safe native capability retains modern auto updates', async t => {
  const folder = mkdtempSync(join(tmpdir(), 'dak-first-hop-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const previous = Object.fromEntries(['window', 'fetch', 'navigator', '__APP_VERSION__'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => { for (const [key, descriptor] of Object.entries(previous)) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]; });
  globalThis.__APP_VERSION__ = '0.8.5';
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'windows nt' } });
  const runtime = join(folder, 'dak-studio-windows-0.8.6.zip');
  const setup = join(folder, 'DAK-Studio-Setup-0.8.6.exe');
  writeFileSync(runtime, 'synthetic runtime'); writeFileSync(setup, 'synthetic installer');
  execFileSync(process.execPath, [fileURLToPath(new URL('./gen-update-manifest.mjs', import.meta.url)), '0.8.6', runtime,
    join(folder, 'latest-v2.json'), '--legacy-out', join(folder, 'latest.json'), '--installer', setup]);
  const legacy = JSON.parse(readFileSync(join(folder, 'latest.json')));
  const modern = JSON.parse(readFileSync(join(folder, 'latest-v2.json')));
  assert.equal(legacy.version, '0.8.6'); assert.equal(modern.version, '0.8.6');
  assert.deepEqual(legacy.assets, {}); assert.match(legacy.notes, /手动下载/);
  assert.equal(modern.assets.windows.sha256, digest(readFileSync(runtime)));
  assert.equal(legacy.manualInstall.sha256, digest(readFileSync(setup)));
  assert.equal(legacy.manualInstall.size, readFileSync(setup).length);

  async function loadPair(prefix, sources) {
    for (const [name, source] of Object.entries(sources)) {
      const rewritten = name === 'bridge' ? source.replaceAll('from "./update"', `from "./${prefix}-update.mjs"`) : source;
      writeFileSync(join(folder, `${prefix}-${name}.mjs`), transformSync(rewritten, { loader: 'ts', format: 'esm', target: 'es2022' }).code);
    }
    return { update: await import(pathToFileURL(join(folder, `${prefix}-update.mjs`))), bridge: await import(pathToFileURL(join(folder, `${prefix}-bridge.mjs`))) };
  }
  const oldSources = {};
  for (const [name, file] of Object.entries({ update: 'legacy-update-v0.8.5.txt', bridge: 'legacy-updater-bridge-v0.8.5.txt' })) {
    const source = readFileSync(new URL(`./test-fixtures/${file}`, import.meta.url), 'utf8');
    assert.equal(digest(source), legacyHashes[file], 'unmodified 0.8.5 snapshot');
    oldSources[name] = source;
  }
  const old = await loadPair('old', oldSources);
  let legacyApply = 0, downloads = 0, safeApply = 0;
  const api = { check_update: async () => legacy, update_start: async () => { downloads++; return { jobId: 'job' }; },
    update_status: async () => ({ state: 'ready' }), update_apply: async () => { legacyApply++; return { ok: true }; } };
  globalThis.window = { pywebview: { api } };
  const bridged = await old.bridge.checkForUpdateViaBridge();
  assert.equal(bridged.latest, '0.8.6'); assert.equal(bridged.asset, undefined);
  assert.equal(old.bridge.canSelfUpdate(bridged.asset), false);
  assert.match(bridged.url, /releases\/latest$/); // actual old manual button destination
  globalThis.fetch = async () => new Response(JSON.stringify(legacy));
  const browser = await old.update.checkForUpdate();
  assert.equal(browser.latest, '0.8.6'); assert.equal(browser.asset, undefined);
  assert.equal(downloads, 0); assert.equal(legacyApply, 0);

  const current = await loadPair('current', {
    update: readFileSync(new URL('apps/dak-studio/src/lib/update.ts', root), 'utf8'),
    bridge: readFileSync(new URL('apps/dak-studio/src/lib/updater-bridge.ts', root), 'utf8'),
  });
  // A newer web overlay must not enable the old native relay, even if it sees v2 assets.
  assert.equal(current.bridge.canSelfUpdate(modern.assets.windows), false);
  await assert.rejects(current.bridge.downloadUpdate(modern.assets.windows, () => {}), /安装器/);
  assert.equal((await current.bridge.applyUpdate('job')).ok, false);
  assert.equal(downloads, 0); assert.equal(legacyApply, 0);
  api.update_apply_runtime_safe = async () => { safeApply++; return { ok: true }; };
  assert.equal(current.bridge.canSelfUpdate(modern.assets.windows), true);
  assert.equal((await current.bridge.downloadUpdate(modern.assets.windows, () => {})).state, 'ready');
  assert.equal((await current.bridge.applyUpdate('job')).ok, true);
  assert.equal(safeApply, 1); assert.equal(legacyApply, 0);
  assert.equal(current.update.manifestSources()[0], 'https://dakupdate.starfie1d.top/releases/latest-v2.json');
});
