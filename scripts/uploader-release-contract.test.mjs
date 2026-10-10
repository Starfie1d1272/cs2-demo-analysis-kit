import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Exercise the actual inline release producer, before it can perform any publishing.
const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
const section = workflow.slice(workflow.indexOf('- name: Generate uploader distribution manifest'));
const script = section.match(/node - <<'NODE'\r?\n([\s\S]*?)\r?\n\s+NODE\r?\n/)[1];
function fixture(includeInstaller, verify) {
  const root = mkdtempSync(join(tmpdir(), 'uploader-release-'));
  try {
    mkdirSync(join(root, 'dist'));
    writeFileSync(join(root, 'dist/rivalhub-demo-uploader-windows-1.2.3.zip'), 'zip');
    writeFileSync(join(root, 'dist/rivalhub-demo-uploader-1.2.3.dmg'), 'dmg');
    if (includeInstaller) writeFileSync(join(root, 'dist/RivalHub-Demo-Uploader-Setup-1.2.3.exe'), 'setup');
    const result = spawnSync(process.execPath, ['-'], {
      cwd: root, input: script, encoding: 'utf8',
      env: { ...process.env, VERSION: '1.2.3', OWNER_REPO: 'example/repository', R2_PUBLIC_BASE: 'https://mirror.example' },
    });
    verify(result, join(root, 'dist/uploader-manifest.json'));
  } finally { rmSync(root, { recursive: true, force: true }); }
}
test('new release refuses a missing setup EXE before writing a distribution manifest', () => {
  fixture(false, (result, manifest) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing uploader asset: dist\/RivalHub-Demo-Uploader-Setup-1\.2\.3\.exe/);
    assert.equal(existsSync(manifest), false);
  });
});
test('new release requires installer metadata while retaining the existing ZIP contract', () => {
  fixture(true, (result, file) => {
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(manifest.assets.windows.name, 'rivalhub-demo-uploader-windows-1.2.3.zip');
    assert.equal(manifest.assets.windows.size, 3);
    assert.equal(manifest.assets.windowsInstaller.name, 'RivalHub-Demo-Uploader-Setup-1.2.3.exe');
    assert.equal(manifest.assets.windowsInstaller.size, 5);
    assert.equal(manifest.assets.windowsInstaller.sha256, '8fb6d5f37e8055ce720bd0b1d56587f88c0071f285966ba17e72b2b12672aa73');
    assert.equal(manifest.assets.windowsInstaller.urls[0], 'https://mirror.example/releases/v1.2.3/RivalHub-Demo-Uploader-Setup-1.2.3.exe');
  });
});
