#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bundledDependencies } from './lib/bundled-dependencies.mjs';
import { isPublishableFile, isWithin } from './lib/package-files.mjs';
import { packageImports } from './lib/package-imports.mjs';
import { allowedDependencies, forbiddenUiDependencies, forbiddenFactsDependencies, dependencyName } from './check-package-boundaries.mjs';

const options = new Set(process.argv.slice(2));
for (const option of options) assert.ok(['--local-platform', '--skip-build'].includes(option), `Unknown option ${option}`);
if (!options.has('--local-platform')) assert.equal(process.platform, 'linux', 'The default tgz gate runs on Linux. Use --local-platform to record checks only for this host.');
console.log(`Public consumer host: ${process.platform}/${process.arch}, Node ${process.version}; results apply only to this platform`);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'dak-public-consumers-')));
const names = Object.keys(allowedDependencies).filter(n => n !== 'rivalhub-upload');
const command = (program, args, cwd = root) => execFileSync(program, args, { cwd, stdio: 'inherit' });
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(directory, e.name)) : [join(directory, e.name)]);
try {
  // Rebuild only libraries: app typechecks can emit test declarations into dist.
  if (!options.has('--skip-build')) command('pnpm', ['-r', ...names.flatMap(n => ['--filter', `@cs2dak/${n}`]), 'build']);
  else console.log('Using existing dist artifacts (--skip-build)');
  const { loadDemoPackageFromZip } = await import(pathToFileURL(join(root, 'packages/demo-io/dist/index.js')).href);
  const demoInput = join(temporary, 'demo-input.json');
  writeFileSync(demoInput, JSON.stringify(await loadDemoPackageFromZip(readFileSync(join(root, 'fixtures/input/cologne-major-2026-stage3-smoke-de_nuke.zip')))));
  const archives = {};
  for (const name of names) {
    const directory = join(temporary, name);
    mkdirSync(directory);
    command('pnpm', ['--filter', `@cs2dak/${name}`, 'pack', '--pack-destination', directory]);
    archives[`@cs2dak/${name}`] = join(directory, readdirSync(directory).find(f => f.endsWith('.tgz')));
    // npm inspects the real compressed archive, rather than the working tree.
    const pack = JSON.parse(execFileSync('npm', ['pack', archives[`@cs2dak/${name}`], '--dry-run', '--json'], { cwd: temporary, encoding: 'utf8' }))[0];
    assert.ok(pack.files.every(f => isPublishableFile(f.path)), `${name}: source/test/build metadata leaked`);
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
    const isUiConsumer = name === 'presentation' || name === 'react';
    for (const installedPath of Object.keys(json(join(consumer, 'package-lock.json')).packages)) {
        const dependency = dependencyName(installedPath.split('node_modules/').at(-1));
        assert.ok(!Object.hasOwn(bundledDependencies, dependency), `${name}: source-only upstream installed ${dependency}`);
        if (isUiConsumer) assert.ok(!forbiddenUiDependencies.has(dependency), `${name}: installed analysis dependency ${dependency}`);
        if (name === 'core' || name === 'contract') assert.ok(!forbiddenFactsDependencies.has(dependency), `${name}: installed non-fact dependency ${dependency}`);
    }
    // This consumer declares only its root + peers; all DAK transitive deps must
    // be installed by the packed manifests, from this run's exact tarballs.
    const closure = new Set();
    const collect = n => {
      if (closure.has(n)) return;
      closure.add(n);
      const manifest = json(join(consumer, 'node_modules', '@cs2dak', n, 'package.json'));
      for (const dep of Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies, ...manifest.optionalDependencies })) if (dep.startsWith('@cs2dak/')) collect(dep.slice(8));
    };
    collect(name);
    assert.deepEqual(readdirSync(join(consumer, 'node_modules', '@cs2dak')).sort(), [...closure].sort());
    for (const n of closure) {
      const installed = join(consumer, 'node_modules', '@cs2dak', n);
      assert.ok(isWithin(consumer, realpathSync(installed)), `${n}: workspace symlink`);
      const manifest = json(join(installed, 'package.json'));
      assert.ok(walk(installed).every(f => isPublishableFile(relative(installed, f))));
      if (n === 'react') {
        const license = readFileSync(join(root, 'scripts/licenses/simpleheat.LICENSE'));
        assert.equal(createHash('sha256').update(license).digest('hex'), '756d6c334c9289a7b8e563cad0be32ab425cd35303d491789ab1adb9fbcef847');
        assert.deepEqual(readFileSync(join(installed, 'dist/simpleheat.LICENSE')), license);
        assert.ok(readFileSync(join(installed, 'dist/THIRD-PARTY-NOTICES.md'), 'utf8').includes(license.toString()));
      }
      for (const [dependency, policy] of Object.entries(bundledDependencies)) {
        for (const kind of ['dependencies', 'peerDependencies', 'optionalDependencies']) assert.ok(!manifest[kind]?.[dependency], `${n}: source-only upstream in consumer manifest`);
        if (manifest.devDependencies?.[dependency]) assert.equal(manifest.devDependencies[dependency], policy.version, `${n}: build input version mismatch`);
      }
      if (isUiConsumer) {
        for (const file of walk(installed).filter(f => /\.(js|d\.ts)$/.test(f))) {
          for (const { specifier } of packageImports(readFileSync(file, 'utf8'), file)) {
            assert.ok(!forbiddenUiDependencies.has(dependencyName(specifier)), `${file}: analysis dependency in UI artifact ${specifier}`);
          }
        }
      }
      for (const file of walk(installed).filter(f => /\.(js|d\.ts)$/.test(f))) {
        for (const { specifier } of packageImports(readFileSync(file, 'utf8'), file)) {
          assert.ok(!Object.keys(bundledDependencies).some(name => specifier === name || specifier.startsWith(name + '/')), `${file}: upstream source import escaped published JS/declarations`);
        }
      }
      const provenancePath = join(installed, 'dist/vendor/upstream-artifacts.json');
      if (walk(installed).includes(provenancePath)) {
        for (const provenance of json(provenancePath)) {
          const policy = bundledDependencies[provenance.name];
          assert.ok(policy, `${n}: unknown bundled upstream`);
          for (const key of ['version', 'integrity', 'tarball', 'licenseSource']) assert.equal(provenance[key], policy[key]);
          assert.equal(createHash('sha256').update(readFileSync(join(installed, 'dist/vendor', policy.license))).digest('hex'), policy.licenseSha256);
          assert.equal(createHash('sha256').update(readFileSync(join(installed, 'dist/vendor', policy.file))).digest('hex'), provenance.outputSha256);
          for (const [source, hash] of Object.entries(provenance.sourceHashes)) assert.equal(hash, policy.sourceHashes[source]);
          assert.ok(Object.keys(provenance.declarationHashes ?? {}).length, `${n}: generated declaration provenance missing`);
          for (const [file, hash] of Object.entries(provenance.declarationHashes)) {
            const declaration = resolve(installed, 'dist/vendor', file);
            assert.ok(isWithin(join(installed, 'dist/vendor'), declaration), `${n}: declaration provenance path escaped`);
            assert.match(file, /\.d\.ts$/);
            assert.equal(createHash('sha256').update(readFileSync(declaration)).digest('hex'), hash, `${n}: generated declaration changed`);
          }
        }
      }
      for (const [key, entry] of Object.entries(manifest.exports)) {
        if (key.endsWith('.css')) { assert.equal(entry, './dist/theme.css'); readFileSync(join(installed, entry)); continue; }
        if (n === 'map-assets' && key === './callout-grid/*.json') {
          assert.equal(entry, './callout-grid/*.json');
          for (const asset of readdirSync(join(installed, 'callout-grid')).filter(file => file.endsWith('.json'))) json(join(installed, 'callout-grid', asset));
          continue;
        }
        assert.match(entry.types, /^\.\/dist\/.*\.d\.ts$/);
        assert.match(entry.import, /^\.\/dist\/.*\.js$/);
        assert.equal(entry.default, entry.import);
        readFileSync(join(installed, entry.types)); readFileSync(join(installed, entry.import));
      }
    }
    const manifest = json(join(consumer, 'node_modules', '@cs2dak', name, 'package.json'));
    const entries = Object.keys(manifest.exports).filter(k => typeof manifest.exports[k] === 'object').map(k => packageName + (k === '.' ? '' : k.slice(1)));
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
      core: `const {readFileSync}=await import('node:fs'); const pkg=m.normalizeDemoPackage(JSON.parse(readFileSync(${JSON.stringify(demoInput)}, 'utf8'))); const facts=m.buildPlayerRoundPerformanceFacts(pkg); assert.ok(facts.playerRounds.length);`,
      'demo-io': `const {readFileSync}=await import('node:fs'); const pkg=await m.loadDemoPackageFromZip(readFileSync(${JSON.stringify(join(root, 'fixtures/input/cologne-major-2026-stage3-smoke-de_nuke.zip'))})); assert.ok(pkg.players.length);`,
      'map-assets': `assert.ok(m.getMapZones('de_mirage')); const grid=await import('@cs2dak/map-assets/callout-grid/de_nuke.json', {with:{type:'json'}}); assert.ok(grid.default);`,
      rating: `assert.deepEqual(m.computeAccountRatings([]), []); assert.deepEqual(m.computeIndicatorRatings([]), []);`,
      tactics: `assert.deepEqual(m.buildTacticalClusters([]), []); assert.ok(m.counterStrafeThresholdForWeapon('ak47').maxSpeed > 0);`,
      cohort: `assert.ok(m.buildSeasonCohortFromRows([]));`,
      tournament: `assert.ok(m.buildTournamentAnalytics([])); assert.ok(m.buildTournamentPerformanceAnalytics([]));`,
      presentation: `assert.equal(m.formatPercent(50, 0), '50%');`,
      analytics: `assert.deepEqual(m.buildMatchBuyQuality([]).teamA, []);`,
      pipeline: `const {readFileSync}=await import('node:fs'); const pkg=JSON.parse(readFileSync(${JSON.stringify(demoInput)}, 'utf8')); const model=m.analyzeMatchWorkspace(pkg); assert.ok(model.scoreboard.length);`,
      react: `const React=await import('react'); const {renderToStaticMarkup}=await import('react-dom/server'); assert.match(renderToStaticMarkup(React.createElement(m.EmptyState, {title:'Packed consumer'})), /Packed consumer/);`,
    };
    assert.ok(calls[name], `${packageName}: actual API smoke is missing`);
    if (isUiConsumer) {
      const { build } = await import('esbuild');
      const browserEntry = join(consumer, 'browser.mjs');
      writeFileSync(browserEntry, `import * as ui from ${JSON.stringify(packageName)}; globalThis.dak = ui;\n`);
      const bundle = await build({ entryPoints: [browserEntry], absWorkingDir: consumer, bundle: true, platform: 'browser', format: 'esm', write: false, metafile: true });
      for (const input of Object.keys(bundle.metafile.inputs)) {
        const dependency = dependencyName(input.split('node_modules/').at(-1));
        assert.ok(!forbiddenUiDependencies.has(dependency), `${name}: browser bundle includes ${dependency}`);
      }
      console.log(`BROWSER PASS ${packageName}: all public root exports bundle without analysis dependencies`);
    }
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
