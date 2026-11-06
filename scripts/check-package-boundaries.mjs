import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path, { dirname, join, resolve } from 'node:path';
import { isTestFile, isWithin } from './lib/package-files.mjs';
import { fileURLToPath } from 'node:url';
import { packageImports } from './lib/package-imports.mjs';
import { bundledDependencies } from './lib/bundled-dependencies.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// DTO-only Core -> Tournament is intentional: emitted Core declarations need it.
export const allowedDependencies = {
  contract: ['zod'],
  maps: [],
  'map-assets': ['@cs2dak/maps'],
  core: ['@cs2dak/contract', '@cs2dak/tournament'],
  rating: ['zod'],
  cohort: ['@cs2dak/rating', 'zod'],
  tactics: ['@cs2dak/contract', '@cs2dak/core', '@cs2dak/maps', '@cs2dak/map-assets', 'zod'],
  'demo-io': ['@cs2dak/contract', '@cs2dak/core', 'jszip'],
  tournament: [],
  presentation: ['@cs2dak/maps', 'zod'],
  react: ['@cs2dak/presentation', '@cs2dak/maps', 'lucide-react', 'react', 'react-dom'],
  analytics: [
    '@cs2dak/contract',
    '@cs2dak/core',
    '@cs2dak/rating',
    '@cs2dak/cohort',
    '@cs2dak/tactics',
    '@cs2dak/maps',
    '@cs2dak/map-assets',
    '@cs2dak/tournament',
    '@cs2dak/presentation',
    'zod',
  ],
  pipeline: [
    '@cs2dak/contract',
    '@cs2dak/core',
    '@cs2dak/rating',
    '@cs2dak/cohort',
    '@cs2dak/tactics',
    '@cs2dak/demo-io',
    '@cs2dak/maps',
    '@cs2dak/map-assets',
    '@cs2dak/tournament',
    '@cs2dak/analytics',
    '@cs2dak/presentation',
  ],
  'rivalhub-upload': [
    '@cs2dak/contract',
    '@cs2dak/core',
    '@cs2dak/demo-io',
    '@cs2dak/tournament',
    'zod',
  ],
};
const allowedBuildDependencies = {
  contract: ['cs2-demo-format'],
  rating: ['@rivalhub/rival-rating'],
};
export const forbiddenUiDependencies = new Set([
  '@cs2dak/contract',
  '@cs2dak/core',
  '@cs2dak/cohort',
  '@cs2dak/tournament',
  '@cs2dak/analytics',
  '@cs2dak/pipeline',
  '@cs2dak/rivalhub-upload',
  '@cs2dak/rating',
  '@cs2dak/tactics',
  '@cs2dak/demo-io',
  '@cs2dak/map-assets',
  '@rivalhub/rival-rating',
  'cs2-demo-format',
  'jszip',
]);

export const forbiddenFactsDependencies = new Set([
  ...Object.keys(allowedDependencies)
    .filter((name) => !['core', 'contract', 'tournament'].includes(name))
    .map((name) => `@cs2dak/${name}`),
  '@rivalhub/rival-rating',
  'cs2-demo-format',
  'jszip',
]);

function checkDependencyClosure(manifests, owners, forbidden) {
  for (const owner of owners) {
    const visited = new Set();
    const visit = (name) => {
      if (visited.has(name)) return;
      visited.add(name);
      const manifest = manifests.get(name);
      assert.ok(manifest, `${owner}: missing manifest for ${name}`);
      for (const dependency of Object.keys({
        ...manifest.dependencies,
        ...manifest.peerDependencies,
        ...manifest.optionalDependencies,
      })) {
        assert.ok(
          !forbidden.has(dependency),
          `${owner}: forbidden dependency in consumer closure: ${dependency}`,
        );
        if (dependency.startsWith('@cs2dak/')) visit(dependency.slice(8));
      }
    };
    visit(owner);
  }
}

export function checkUiDependencyClosure(manifests) {
  checkDependencyClosure(manifests, ['presentation', 'react'], forbiddenUiDependencies);
}

export function checkFactsDependencyClosure(manifests) {
  checkDependencyClosure(manifests, ['contract', 'core'], forbiddenFactsDependencies);
}

export function dependencyName(specifier) {
  return specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0];
}
export function checkImport(
  owner,
  imported,
  declared,
  file,
  packagesRoot = join(root, 'packages'),
  paths = path,
) {
  const { specifier, typeOnly } = imported;
  if (specifier.startsWith('.')) {
    assert.ok(!isTestFile(specifier), `${file}: production import of test module ${specifier}`);
    const target = paths.resolve(paths.dirname(file), specifier);
    assert.ok(
      isWithin(paths.resolve(packagesRoot, owner), target, paths),
      `${file}: cross-package relative import ${specifier}`,
    );
    return;
  }
  if (specifier.startsWith('node:')) {
    assert.ok(
      ['map-assets', 'demo-io'].includes(owner),
      `${file}: Node dependency forbidden for ${owner}`,
    );
    return;
  }
  const dependency = dependencyName(specifier);
  assert.ok(
    [...allowedDependencies[owner], ...(allowedBuildDependencies[owner] ?? [])].includes(
      dependency,
    ),
    `${file}: forbidden edge ${owner} -> ${specifier}`,
  );
  assert.ok(declared.has(dependency), `${file}: undeclared dependency ${dependency}`);
  if (owner === 'core' && dependency === '@cs2dak/tournament')
    assert.ok(typeOnly, `${file}: Core may consume Tournament DTOs only`);
}
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(directory, e.name)) : [join(directory, e.name)],
  );
}
export function checkBoundaries(repoRoot = root) {
  const manifests = new Map();
  for (const [owner, allowed] of Object.entries(allowedDependencies)) {
    const directory = join(repoRoot, 'packages', owner);
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
    manifests.set(owner, manifest);
    const declared = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
    ]);
    for (const dependency of declared)
      assert.ok(
        allowed.includes(dependency),
        `${owner}: forbidden manifest dependency ${dependency}`,
      );
    for (const dependency of allowedBuildDependencies[owner] ?? []) {
      if (manifest.devDependencies?.[dependency] == null) continue;
      assert.equal(
        manifest.devDependencies[dependency],
        bundledDependencies[dependency].version,
        `${owner}: upstream build dependency must be exact`,
      );
      declared.add(dependency);
    }
    if (owner === 'tournament')
      assert.equal(
        declared.size,
        0,
        'Tournament must retain zero runtime/peer/optional dependencies',
      );
    for (const file of files(join(directory, 'src')).filter(
      (f) => /\.tsx?$/.test(f) && !isTestFile(f),
    )) {
      for (const imported of packageImports(readFileSync(file, 'utf8'), file))
        checkImport(owner, imported, declared, file, join(repoRoot, 'packages'));
    }
  }
  checkUiDependencyClosure(manifests);
  checkFactsDependencyClosure(manifests);
  console.log(
    'Package boundaries OK: manifests and all production source imports (including type/dynamic imports)',
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  checkBoundaries();
