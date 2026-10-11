// Preserve DAK module identities; compile only pinned upstream source-only packages.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { bundledDependencies } from './lib/bundled-dependencies.mjs';
import { packageImports } from './lib/package-imports.mjs';

const requireFromPackage = createRequire(join(process.cwd(), 'package.json'));
rmSync('dist', { recursive: true, force: true });
const compiler = join(dirname(requireFromPackage.resolve('typescript/package.json')), 'bin/tsc');
execFileSync(process.execPath, [compiler, '-p', 'tsconfig.build.json'], { stdio: 'inherit' });
const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(directory, e.name)) : [join(directory, e.name)]);
const emittedFiles = files('dist').filter(path => /\.(js|d\.ts)$/.test(path));
const runtimeDependencies = new Set(emittedFiles.filter(path => path.endsWith('.js')).flatMap(path =>
  packageImports(readFileSync(path, 'utf8'), path).map(i => i.specifier).filter(s => Object.hasOwn(bundledDependencies, s))));
const provenance = [];
for (const name of runtimeDependencies) {
  const policy = bundledDependencies[name];
  const entry = requireFromPackage.resolve(name);
  const upstreamRoot = dirname(dirname(entry));
  const manifest = JSON.parse(readFileSync(join(upstreamRoot, 'package.json'), 'utf8'));
  const ownManifest = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(manifest.version, policy.version, `${name}: bundled source version changed`);
  assert.equal(ownManifest.dependencies[name], policy.version, `${name}: declaration/runtime dependency must be exact`);
  mkdirSync('dist/vendor', { recursive: true });
  const result = await build({ entryPoints: [entry], outfile: join('dist/vendor', policy.file), bundle: true,
    packages: 'external', format: 'esm', platform: 'neutral', target: 'es2022', metafile: true,
    banner: { js: `// Generated from ${name}@${policy.version}; upstream owns semantics. See ${policy.license} and upstream-artifacts.json.` },
  });
  const sourceHashes = {};
  for (const input of Object.keys(result.metafile.inputs)) {
    const absolute = resolve(input);
    assert.ok(absolute.startsWith(upstreamRoot + sep), `${name}: unexpected bundled source ${input}`);
    sourceHashes[relative(upstreamRoot, absolute).split(sep).join('/')] = createHash('sha256').update(readFileSync(absolute)).digest('hex');
  }
  for (const [file, hash] of Object.entries(sourceHashes)) assert.equal(hash, policy.sourceHashes[file], `${name}: upstream source drift in ${file}`);
  const licensePath = fileURLToPath(new URL(`./licenses/${policy.license}`, import.meta.url));
  assert.equal(createHash('sha256').update(readFileSync(licensePath)).digest('hex'), policy.licenseSha256, `${name}: license changed`);
  copyFileSync(licensePath, join('dist/vendor', policy.license));
  const outputSha256 = createHash('sha256').update(readFileSync(join('dist/vendor', policy.file))).digest('hex');
  provenance.push({ name, ...policy, sourceHashes, outputSha256 });
}
if (provenance.length) writeFileSync('dist/vendor/upstream-artifacts.json', JSON.stringify(provenance, null, 2) + '\n');

for (const path of emittedFiles) {
  const source = readFileSync(path, 'utf8');
  const edits = [];
  for (const { specifier, start, end } of packageImports(source, path)) {
    if (path.endsWith('.js') && Object.hasOwn(bundledDependencies, specifier)) {
      let replacement = relative(dirname(path), join('dist/vendor', bundledDependencies[specifier].file)).split(sep).join('/');
      if (!replacement.startsWith('.')) replacement = './' + replacement;
      edits.push([start, end, replacement]);
    } else if (specifier.startsWith('.') && !/\.(js|json|css)$/.test(specifier)) {
      const target = join(dirname(path), specifier);
      const suffix = existsSync(`${target}.js`) ? '.js' : existsSync(`${target}/index.js`) ? '/index.js' : null;
      if (!suffix) throw new Error(`${path}: unresolved emitted import ${specifier}`);
      edits.push([start, end, specifier + suffix]);
    }
  }
  let output = source;
  for (const [start, end, value] of edits.sort((a, b) => b[0] - a[0])) output = output.slice(0, start) + value + output.slice(end);
  writeFileSync(path, output);
}
if (existsSync('src/theme.css')) copyFileSync('src/theme.css', 'dist/theme.css');
