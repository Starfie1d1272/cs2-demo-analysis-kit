// Preserve DAK module identities; compile only pinned upstream source-only packages.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { bundledDependencies } from './lib/bundled-dependencies.mjs';
import { packageImports } from './lib/package-imports.mjs';

const requireFromPackage = createRequire(join(process.cwd(), 'package.json'));
rmSync('dist', { recursive: true, force: true });
const compiler = join(dirname(requireFromPackage.resolve('typescript/package.json')), 'bin/tsc');
execFileSync(process.execPath, [compiler, '-p', 'tsconfig.build.json'], { stdio: 'inherit' });
const files = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(directory, e.name)) : [join(directory, e.name)],
  );
const emittedFiles = files('dist').filter((path) => /\.(js|d\.ts)$/.test(path));
const upstreamDependencies = new Set(
  emittedFiles.flatMap((path) =>
    packageImports(readFileSync(path, 'utf8'), path)
      .map((i) => i.specifier)
      .filter((s) => Object.hasOwn(bundledDependencies, s)),
  ),
);
const provenance = [];
for (const name of upstreamDependencies) {
  const policy = bundledDependencies[name];
  const entry = requireFromPackage.resolve(name);
  const upstreamRoot = dirname(dirname(entry));
  const manifest = JSON.parse(readFileSync(join(upstreamRoot, 'package.json'), 'utf8'));
  const ownManifest = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(manifest.version, policy.version, `${name}: bundled source version changed`);
  assert.equal(
    ownManifest.devDependencies?.[name],
    policy.version,
    `${name}: compiled upstream must be an exact build dependency`,
  );
  for (const kind of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    assert.ok(
      !ownManifest[kind]?.[name],
      `${name}: source-only upstream must not enter consumer dependencies`,
    );
  }
  mkdirSync('dist/vendor', { recursive: true });
  const result = await build({
    entryPoints: [entry],
    outfile: join('dist/vendor', policy.file),
    bundle: true,
    packages: 'external',
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    metafile: true,
    banner: {
      js: `// Generated from ${name}@${policy.version}; upstream owns semantics. See ${policy.license} and upstream-artifacts.json.`,
    },
  });
  const sourceHashes = {};
  for (const input of Object.keys(result.metafile.inputs)) {
    const absolute = resolve(input);
    assert.ok(
      absolute.startsWith(upstreamRoot + sep),
      `${name}: unexpected bundled source ${input}`,
    );
    sourceHashes[relative(upstreamRoot, absolute).split(sep).join('/')] = createHash('sha256')
      .update(readFileSync(absolute))
      .digest('hex');
  }
  for (const [file, hash] of Object.entries(sourceHashes))
    assert.equal(hash, policy.sourceHashes[file], `${name}: upstream source drift in ${file}`);
  const licensePath = fileURLToPath(new URL(`./licenses/${policy.license}`, import.meta.url));
  assert.equal(
    createHash('sha256').update(readFileSync(licensePath)).digest('hex'),
    policy.licenseSha256,
    `${name}: license changed`,
  );
  copyFileSync(licensePath, join('dist/vendor', policy.license));
  const typesDirectory = join('dist/vendor', policy.file.replace(/\.js$/, '-types'));
  const configDirectory = mkdtempSync(join(tmpdir(), 'dak-upstream-declarations-'));
  let listedFiles;
  try {
    const configPath = join(configDirectory, 'tsconfig.json');
    const ownSources = Object.keys(policy.sourceHashes)
      .map((file) => join(upstreamRoot, file))
      .filter((file) => file.startsWith(dirname(entry) + sep) && file.endsWith('.ts'));
    assert.ok(ownSources.includes(entry), `${name}: unpinned declaration entry`);
    writeFileSync(
      configPath,
      JSON.stringify({
        files: ownSources,
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          declaration: true,
          emitDeclarationOnly: true,
          noEmitOnError: true,
          strict: true,
          skipLibCheck: false,
          resolveJsonModule: true,
          esModuleInterop: true,
          types: [],
          rootDir: dirname(entry),
          outDir: resolve(typesDirectory),
        },
      }),
    );
    listedFiles = execFileSync(process.execPath, [compiler, '-p', configPath, '--listFiles'], {
      encoding: 'utf8',
    });
  } catch (error) {
    throw new Error(
      `${name}: upstream declaration emit failed\n${error.stdout ?? ''}\n${error.stderr ?? ''}`,
      { cause: error },
    );
  } finally {
    rmSync(configDirectory, { recursive: true, force: true });
  }
  // tsc prints forward slashes on Windows; compare native paths, including drive casing.
  const declarationSources = listedFiles
    .split(/\r?\n/)
    .filter(Boolean)
    .map((file) => resolve(file))
    .filter((file) => {
      const fromRoot = relative(upstreamRoot, file);
      return (
        fromRoot !== '' &&
        fromRoot !== '..' &&
        !fromRoot.startsWith(`..${sep}`) &&
        !isAbsolute(fromRoot)
      );
    });
  assert.ok(
    declarationSources.some((file) => relative(entry, file) === ''),
    `${name}: declaration compiler did not report its entry source`,
  );
  for (const file of declarationSources) {
    const key = relative(upstreamRoot, file).split(sep).join('/');
    const hash = createHash('sha256').update(readFileSync(file)).digest('hex');
    assert.equal(hash, policy.sourceHashes[key], `${name}: declaration source drift in ${key}`);
    sourceHashes[key] = hash;
  }
  // JSON weight exports need standalone types, so consumers need no JSON compiler option.
  const jsonSources = declarationSources.filter((file) => file.endsWith('.json'));
  if (jsonSources.length) {
    const jsonDirectory = mkdtempSync(join(tmpdir(), 'dak-upstream-json-types-'));
    try {
      const generatedSources = jsonSources.map((file) => {
        const generated = join(
          jsonDirectory,
          relative(dirname(entry), file).replace(/\.json$/, '.ts'),
        );
        assert.ok(
          resolve(generated).startsWith(resolve(jsonDirectory) + sep),
          `${name}: JSON declaration input escaped source root`,
        );
        mkdirSync(dirname(generated), { recursive: true });
        writeFileSync(
          generated,
          `const value = ${readFileSync(file, 'utf8')};\nexport default value;\n`,
        );
        return generated;
      });
      const jsonConfig = join(jsonDirectory, 'tsconfig.json');
      writeFileSync(
        jsonConfig,
        JSON.stringify({
          files: generatedSources,
          compilerOptions: {
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'Bundler',
            declaration: true,
            emitDeclarationOnly: true,
            noEmitOnError: true,
            strict: true,
            types: [],
            rootDir: jsonDirectory,
            outDir: resolve(typesDirectory),
          },
        }),
      );
      execFileSync(process.execPath, [compiler, '-p', jsonConfig], { stdio: 'inherit' });
    } finally {
      rmSync(jsonDirectory, { recursive: true, force: true });
    }
  }
  const emittedDeclarations = files(typesDirectory);
  assert.ok(emittedDeclarations.length, `${name}: no declaration artifacts emitted`);
  for (const file of emittedDeclarations)
    assert.match(file, /\.d\.ts$/, `${name}: unexpected declaration artifact`);
  for (const file of emittedDeclarations) {
    let content = readFileSync(file, 'utf8');
    for (const { specifier, start, end } of packageImports(content, file).sort(
      (a, b) => b.start - a.start,
    )) {
      if (!specifier.startsWith('.')) {
        const dependency = specifier.startsWith('@')
          ? specifier.split('/').slice(0, 2).join('/')
          : specifier.split('/')[0];
        assert.ok(
          ownManifest.dependencies?.[dependency] || ownManifest.peerDependencies?.[dependency],
          `${name}: undeclared external declaration dependency ${dependency}`,
        );
        continue;
      }
      if (/\.json$/.test(specifier)) {
        const replacement = specifier.replace(/\.json$/, '.js');
        assert.ok(
          existsSync(resolve(dirname(file), replacement.replace(/\.js$/, '.d.ts'))),
          `${file}: missing JSON declaration target ${specifier}`,
        );
        content = content.slice(0, start) + replacement + content.slice(end);
        continue;
      }
      if (/\.js$/.test(specifier)) {
        assert.ok(
          existsSync(resolve(dirname(file), specifier.replace(/\.js$/, '.d.ts'))),
          `${file}: missing declaration target ${specifier}`,
        );
        continue;
      }
      const target = resolve(dirname(file), specifier);
      const suffix = existsSync(`${target}.d.ts`)
        ? '.js'
        : existsSync(join(target, 'index.d.ts'))
          ? '/index.js'
          : null;
      assert.ok(suffix, `${file}: unresolved declaration target ${specifier}`);
      content = content.slice(0, start) + specifier + suffix + content.slice(end);
    }
    writeFileSync(file, content);
  }
  const declarationEntry = join('dist/vendor', policy.file.replace(/\.js$/, '.d.ts'));
  writeFileSync(
    declarationEntry,
    `export * from './${policy.file.replace(/\.js$/, '-types')}/index.js';\n`,
  );
  const declarationHashes = Object.fromEntries(
    [...emittedDeclarations, declarationEntry].map((file) => [
      relative('dist/vendor', file).split(sep).join('/'),
      createHash('sha256').update(readFileSync(file)).digest('hex'),
    ]),
  );
  const outputSha256 = createHash('sha256')
    .update(readFileSync(join('dist/vendor', policy.file)))
    .digest('hex');
  provenance.push({ name, ...policy, sourceHashes, outputSha256, declarationHashes });
}
if (provenance.length)
  writeFileSync('dist/vendor/upstream-artifacts.json', JSON.stringify(provenance, null, 2) + '\n');

for (const path of emittedFiles) {
  const source = readFileSync(path, 'utf8');
  const edits = [];
  for (const { specifier, start, end } of packageImports(source, path)) {
    if (Object.hasOwn(bundledDependencies, specifier)) {
      let replacement = relative(
        dirname(path),
        join('dist/vendor', bundledDependencies[specifier].file),
      )
        .split(sep)
        .join('/');
      if (!replacement.startsWith('.')) replacement = './' + replacement;
      edits.push([start, end, replacement]);
    } else if (specifier.startsWith('.') && !/\.(js|json|css)$/.test(specifier)) {
      const target = join(dirname(path), specifier);
      const suffix = existsSync(`${target}.js`)
        ? '.js'
        : existsSync(`${target}/index.js`)
          ? '/index.js'
          : null;
      if (!suffix) throw new Error(`${path}: unresolved emitted import ${specifier}`);
      edits.push([start, end, specifier + suffix]);
    }
  }
  let output = source;
  for (const [start, end, value] of edits.sort((a, b) => b[0] - a[0]))
    output = output.slice(0, start) + value + output.slice(end);
  writeFileSync(path, output);
}
if (existsSync('src/theme.css')) copyFileSync('src/theme.css', 'dist/theme.css');
if (JSON.parse(readFileSync('package.json', 'utf8')).name === '@cs2dak/react') {
  copyFileSync(
    fileURLToPath(new URL('../THIRD-PARTY-NOTICES.md', import.meta.url)),
    'dist/THIRD-PARTY-NOTICES.md',
  );
  copyFileSync(
    fileURLToPath(new URL('./licenses/simpleheat.LICENSE', import.meta.url)),
    'dist/simpleheat.LICENSE',
  );
}
