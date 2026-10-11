import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allowedDependencies, checkBoundaries, checkImport } from './check-package-boundaries.mjs';
import { packageImports } from './lib/package-imports.mjs';

const imports = code => packageImports(code, 'fixture.ts');
const check = (owner, code, dependencies = []) => {
  for (const imported of imports(code)) checkImport(owner, imported, new Set(dependencies), `/fixture/packages/${owner}/src/file.ts`, '/fixture/packages');
};
test('actual production manifests and source graph', () => checkBoundaries());
test('forbidden edges include type, re-export, require and dynamic imports', () => {
  for (const code of [
    "import type { X } from '@cs2dak/presentation';",
    "export { X } from '@cs2dak/react';",
    "const x = import('@cs2dak/cohort');",
    "const x = require('@cs2dak/cohort');",
    "type X = import('@cs2dak/react').X;",
  ]) assert.throws(() => check('core', code, ['@cs2dak/presentation', '@cs2dak/react', '@cs2dak/cohort']), /forbidden edge/);
});
test('canonical adapter permits DTO edge but no Core runtime Tournament dependency', () => {
  check('core', "import type { X } from '@cs2dak/tournament';", ['@cs2dak/tournament']);
  check('core', "import { type X } from '@cs2dak/tournament';", ['@cs2dak/tournament']);
  assert.throws(() => check('core', "import { X } from '@cs2dak/tournament';", ['@cs2dak/tournament']), /DTOs only/);
});
test('consumer declaration does not permit undeclared deps or cross-package source paths', () => {
  assert.throws(() => check('react', "import { X } from '@cs2dak/maps/calibration';"), /undeclared dependency/);
  assert.throws(() => check('maps', "import { X } from '../../core/src/index.js';"), /cross-package relative import/);
  assert.throws(() => check('tournament', "import type { X } from '@cs2dak/contract';", ['@cs2dak/contract']), /forbidden edge/);
  assert.throws(() => check('react', "import { x } from 'node:fs';"), /Node dependency forbidden/);
});
test('syntax inventory ignores comments/strings and rejects computed dependency escapes', () => {
  assert.equal(imports(`// import { X } from '@cs2dak/core';\nconst text = "import('bad')";`).length, 0);
  assert.throws(() => imports('const x = import(packageName);'), /nonliteral module dependency/);
});

test('manifest-only reverse edges and Tournament runtime deps cannot bypass source graph', () => {
  const root = mkdtempSync(join(tmpdir(), 'dak-boundary-fixture-'));
  try {
    for (const name of Object.keys(allowedDependencies)) {
      const directory = join(root, 'packages', name);
      mkdirSync(join(directory, 'src'), { recursive: true });
      writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: `@cs2dak/${name}` }));
    }
    for (const [owner, dependency] of [['core', '@cs2dak/presentation'], ['cohort', '@cs2dak/react'], ['tournament', 'zod'], ['react', '@cs2dak/core']]) {
      const manifest = join(root, 'packages', owner, 'package.json');
      writeFileSync(manifest, JSON.stringify({ dependencies: { [dependency]: '*' } }));
      assert.throws(() => checkBoundaries(root), /forbidden manifest dependency/);
      writeFileSync(manifest, '{}');
    }
    assert.throws(() => check('core', "import { x } from './helper.test.js';"), /production import of test/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
