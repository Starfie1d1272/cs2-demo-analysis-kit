import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { bundledDependencies } from './lib/bundled-dependencies.mjs';

/** Original license bytes are assets, not comments subject to bundle minification. */
export function desktopNoticeAssets(includeSimpleheat = false) {
  const notice = readFileSync(new URL('../THIRD-PARTY-NOTICES.md', import.meta.url), 'utf8');
  const assets = [{ fileName: 'THIRD-PARTY-NOTICES.md', source: notice }];
  for (const policy of Object.values(bundledDependencies)) {
    const source = readFileSync(new URL(`./licenses/${policy.license}`, import.meta.url), 'utf8');
    assert.equal(createHash('sha256').update(source).digest('hex'), policy.licenseSha256);
    assert.ok(notice.includes(source), `missing full ${policy.license} in third-party notices`);
    assets.push({ fileName: policy.license, source });
  }
  if (includeSimpleheat) {
    const source = readFileSync(new URL('./licenses/simpleheat.LICENSE', import.meta.url), 'utf8');
    assert.equal(createHash('sha256').update(source).digest('hex'), '756d6c334c9289a7b8e563cad0be32ab425cd35303d491789ab1adb9fbcef847');
    assert.ok(notice.includes(source));
    assets.push({ fileName: 'simpleheat.LICENSE', source });
  }
  assets.push({ fileName: 'upstream-license-provenance.json', source: JSON.stringify(bundledDependencies, null, 2) + '\n' });
  return assets;
}
