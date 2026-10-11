#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowedDependencies } from './check-package-boundaries.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(join(tmpdir(), 'dak-public-consumers-'));
const names = Object.keys(allowedDependencies).filter(n => n !== 'rivalhub-upload');
const command = (program, args, cwd = root) => execFileSync(program, args, { cwd, stdio: 'inherit' });
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(directory, e.name)) : [join(directory, e.name)]);
try {
  // Rebuild only libraries: app typechecks can emit test declarations into dist.
  command('pnpm', ['-r', ...names.flatMap(n => ['--filter', `@cs2dak/${n}`]), 'build']);
  const archives = {};
  for (const name of names) {
    const directory = join(temporary, name);
    mkdirSync(directory);
    command('pnpm', ['--filter', `@cs2dak/${name}`, 'pack', '--pack-destination', directory]);
    archives[`@cs2dak/${name}`] = join(directory, readdirSync(directory).find(f => f.endsWith('.tgz')));
    // npm inspects the real compressed archive, rather than the working tree.
    const pack = JSON.parse(execFileSync('npm', ['pack', archives[`@cs2dak/${name}`], '--dry-run', '--json'], { cwd: temporary, encoding: 'utf8' }))[0];
    assert.ok(pack.files.every(f => !f.path.startsWith('src/') && !/\.test\.|\.tsbuildinfo$|\.map$/.test(f.path)), `${name}: source/test/build metadata leaked`);
    console.log(`PACK ${name}: ${pack.size} compressed bytes / ${pack.unpackedSize} unpacked bytes / ${pack.files.length} files`);
  }
  const failures = [];
  for (const name of names) {
    const consumer = join(temporary, `consumer-${name}`);
    mkdirSync(consumer);
    const packageName = `@cs2dak/${name}`;
    const peers = name === 'react' ? { react: json(join(root, 'package.json')).dependencies.react, 'react-dom': json(join(root, 'package.json')).dependencies['react-dom'], '@types/react': json(join(root, 'package.json')).devDependencies['@types/react'] } : {};
    writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: { [packageName]: `file:${archives[packageName]}`, ...peers }, overrides: Object.fromEntries(Object.entries(archives).map(([n, path]) => [n, `file:${path}`])) }));
    command('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts'], consumer);
    // This consumer declares only its root + peers; all DAK transitive deps must
    // be installed by the packed manifests, from this run's exact tarballs.
    const closure = new Set();
    const collect = n => {
      if (closure.has(n)) return;
      closure.add(n);
      const manifest = json(join(consumer, 'node_modules', '@cs2dak', n, 'package.json'));
      for (const dep of Object.keys(manifest.dependencies ?? {})) if (dep.startsWith('@cs2dak/')) collect(dep.slice(8));
    };
    collect(name);
    assert.deepEqual(readdirSync(join(consumer, 'node_modules', '@cs2dak')).sort(), [...closure].sort());
    for (const n of closure) {
      const installed = join(consumer, 'node_modules', '@cs2dak', n);
      assert.ok(realpathSync(installed).startsWith(consumer + '/'), `${n}: workspace symlink`);
      const manifest = json(join(installed, 'package.json'));
      assert.ok(!walk(installed).some(f => /\.test\.|\.tsbuildinfo$|\.map$/.test(f) || f.includes('/src/')));
      for (const [key, entry] of Object.entries(manifest.exports)) {
        if (key.endsWith('.css')) { assert.equal(entry, './dist/theme.css'); readFileSync(join(installed, entry)); continue; }
        assert.match(entry.types, /^\.\/dist\/.*\.d\.ts$/);
        assert.match(entry.import, /^\.\/dist\/.*\.js$/);
        assert.equal(entry.default, entry.import);
        readFileSync(join(installed, entry.types)); readFileSync(join(installed, entry.import));
      }
    }
    const manifest = json(join(consumer, 'node_modules', '@cs2dak', name, 'package.json'));
    const entries = Object.keys(manifest.exports).filter(k => !k.endsWith('.css')).map(k => packageName + (k === '.' ? '' : k.slice(1)));
    writeFileSync(join(consumer, 'entries.mjs'), `import assert from 'node:assert/strict';\n${entries.map((entry, i) => `import * as entry${i} from ${JSON.stringify(entry)}; assert.ok(Object.keys(entry${i}).length);`).join('\n')}\n`);
    let runtimePassed = false;
    try { command(process.execPath, [join(consumer, 'entries.mjs')], consumer); runtimePassed = true; }
    catch { failures.push(`${packageName}: Node ESM import failed`); }
    writeFileSync(join(consumer, 'consumer.ts'), entries.map((entry, i) => `import * as entry${i} from ${JSON.stringify(entry)}; void entry${i};`).join('\n'));
    writeFileSync(join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, noEmit: true, module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022', lib: ['ES2022', 'DOM'], types: [], skipLibCheck: false }, include: ['consumer.ts'] }));
    let typesPassed = false;
    try { command(join(root, 'node_modules', '.bin', 'tsc'), ['-p', join(consumer, 'tsconfig.json')], consumer); typesPassed = true; }
    catch { failures.push(`${packageName}: strict NodeNext declarations failed`); }
    if (typesPassed) console.log(`TYPES PASS ${packageName}: strict NodeNext, full declaration closure`);
    const calls = {
      contract: `assert.equal(m.teamKeySchema.parse('teamA'), 'teamA');`,
      maps: `assert.ok(m.getMapCalibration('de_nuke'));`,
      core: `const {readFileSync}=await import('node:fs'); const pkg=await m.loadDemoPackageFromZip(readFileSync(${JSON.stringify(join(root, 'fixtures/input/cologne-major-2026-stage3-smoke-de_nuke.zip'))})); const bundle=m.analyzeDemoPackage(pkg); assert.ok(bundle.scoreboard.length);`,
      cohort: `assert.ok(m.buildSeasonCohort([]));`,
      tournament: `assert.ok(m.buildTournamentAnalytics([])); assert.ok(m.buildTournamentPerformanceAnalytics([]));`,
      presentation: `assert.equal(m.formatPercent(50, 0), '50%');`,
      react: `const React=await import('react'); const {renderToStaticMarkup}=await import('react-dom/server'); assert.match(renderToStaticMarkup(React.createElement(m.EmptyState, {title:'Packed consumer'})), /Packed consumer/);`,
    };
    writeFileSync(join(consumer, 'calls.mjs'), `import assert from 'node:assert/strict'; import * as m from ${JSON.stringify(packageName)}; ${calls[name]}\n`);
    if (runtimePassed) {
      try { command(process.execPath, [join(consumer, 'calls.mjs')], consumer); }
      catch { failures.push(`${packageName}: actual API call failed`); runtimePassed = false; }
    }
    if (runtimePassed && typesPassed) console.log(`PASS ${packageName}: independent Node ESM + actual API call + strict NodeNext declarations; DAK closure ${[...closure].join(', ')}`);
  }
  assert.deepEqual(failures, [], `Packed public consumers failed:\n${failures.join('\n')}`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
