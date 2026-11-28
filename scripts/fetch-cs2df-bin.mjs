#!/usr/bin/env node
// Download pinned native cs2df release binary, verify SHA256SUMS.txt, and place in python/packaging/bin/.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CS2DF_VERSION = 'v5.0.0';
const EXACT_VERSION = '5.0.0';
const RELEASE_BASE = `https://github.com/Starfie1d1272/cs2-demo-format/releases/download/${CS2DF_VERSION}`;
const OUT_DIR = join(REPO, 'python', 'packaging', 'bin');
const LICENSE_FILES = ['LICENSE', 'THIRD-PARTY-LICENSES.txt'];

function assetForPlatform() {
  if (process.platform === 'darwin' && process.arch === 'arm64') {
    return { archive: `cs2df-${CS2DF_VERSION}-aarch64-apple-darwin.tar.gz`, bin: 'cs2df' };
  }
  if (process.platform === 'linux' && process.arch === 'x64') {
    return { archive: `cs2df-${CS2DF_VERSION}-x86_64-unknown-linux-gnu.tar.gz`, bin: 'cs2df' };
  }
  if (process.platform === 'win32' && process.arch === 'x64') {
    return { archive: `cs2df-${CS2DF_VERSION}-x86_64-pc-windows-msvc.zip`, bin: 'cs2df.exe' };
  }
  throw new Error(
    `Unsupported platform for cs2df ${CS2DF_VERSION}: ${process.platform}/${process.arch}`,
  );
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function verifyExactVersion(binPath) {
  const out = execFileSync(binPath, ['--version'], { encoding: 'utf8' }).trim();
  if (out !== `cs2df ${EXACT_VERSION}`) {
    throw new Error(`Expected exact cs2df ${EXACT_VERSION} at ${binPath}, got: ${out}`);
  }
}

async function fetchBuffer(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

const { archive, bin } = assetForPlatform();
mkdirSync(OUT_DIR, { recursive: true });
const targetBin = join(OUT_DIR, bin);
const stampPath = join(OUT_DIR, `${bin}.${CS2DF_VERSION}.sha256`);

if (
  existsSync(targetBin) &&
  existsSync(stampPath) &&
  LICENSE_FILES.every((f) => existsSync(join(OUT_DIR, f)))
) {
  try {
    verifyExactVersion(targetBin);
    const expectedBinHash = readFileSync(stampPath, 'utf8').trim();
    const actualBinHash = sha256(readFileSync(targetBin));
    if (actualBinHash === expectedBinHash) {
      console.log(`Using verified cached cs2df ${EXACT_VERSION} binary: ${targetBin}`);
      process.exit(0);
    }
  } catch {
    // Re-download below if cached binary or stamp fails verification.
  }
  rmSync(targetBin, { force: true });
  rmSync(stampPath, { force: true });
}

console.log(`Downloading ${archive} and SHA256SUMS.txt (${CS2DF_VERSION})...`);
const [sumsBuf, archiveBuf] = await Promise.all([
  fetchBuffer(`${RELEASE_BASE}/SHA256SUMS.txt`),
  fetchBuffer(`${RELEASE_BASE}/${archive}`),
]);

const expectedLine = sumsBuf
  .toString('utf8')
  .split(/\r?\n/)
  .find((line) => line.trim().endsWith(` ${archive}`) || line.trim().endsWith(`*${archive}`));
if (!expectedLine) {
  throw new Error(`${archive} not found in SHA256SUMS.txt`);
}
const expectedHash = expectedLine.trim().split(/\s+/)[0].toLowerCase();
const actualHash = sha256(archiveBuf);
if (actualHash !== expectedHash) {
  throw new Error(`SHA-256 mismatch for ${archive}: expected ${expectedHash}, got ${actualHash}`);
}
console.log(`Verified SHA-256 for ${archive}: ${actualHash}`);

const tmp = mkdtempSync(join(tmpdir(), 'dak-fetch-cs2df-'));
try {
  const archivePath = join(tmp, archive);
  writeFileSync(archivePath, archiveBuf);
  if (archive.endsWith('.zip')) {
    if (process.platform === 'win32') {
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${tmp}' -Force`,
        ],
        { stdio: 'inherit' },
      );
    } else {
      execFileSync('unzip', ['-q', '-o', archivePath, '-d', tmp], { stdio: 'inherit' });
    }
  } else {
    execFileSync('tar', ['-xzf', archivePath, '-C', tmp], { stdio: 'inherit' });
  }
  const extracted = join(tmp, bin);
  if (!existsSync(extracted)) {
    throw new Error(`Extracted archive missing ${bin}`);
  }
  copyFileSync(extracted, targetBin);
  if (process.platform !== 'win32') {
    chmodSync(targetBin, 0o755);
  }
  for (const licenseFile of LICENSE_FILES) {
    const srcLicense = join(tmp, licenseFile);
    if (!existsSync(srcLicense)) {
      throw new Error(`Extracted archive missing ${licenseFile}`);
    }
    copyFileSync(srcLicense, join(OUT_DIR, licenseFile));
  }
  verifyExactVersion(targetBin);
  writeFileSync(stampPath, `${sha256(readFileSync(targetBin))}\n`, 'utf8');
  console.log(`Staged native cs2df ${EXACT_VERSION} binary & licenses → ${OUT_DIR}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
