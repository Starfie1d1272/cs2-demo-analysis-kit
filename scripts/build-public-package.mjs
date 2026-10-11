// Compile without bundling: dependencies and existing public entry points stay explicit.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { packageImports } from './lib/package-imports.mjs';

rmSync('dist', { recursive: true, force: true });
execFileSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.build.json'], { stdio: 'inherit' });

function visitDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { visitDirectory(path); continue; }
    if (!/\.(js|d\.ts)$/.test(path)) continue;
    const source = readFileSync(path, 'utf8');
    const edits = [];
    for (const { specifier, start, end } of packageImports(source, path)) {
      if (specifier.startsWith('.') && !/\.(js|json|css)$/.test(specifier)) {
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
}
visitDirectory('dist');
if (existsSync('src/theme.css')) copyFileSync('src/theme.css', 'dist/theme.css');
