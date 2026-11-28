#!/usr/bin/env node
// 通用赛事批量导出：读 spec 的 export 块，按阶段展开源 glob，并发解压后调用原生 cs2df export-batch。
// 任何赛事写一个 spec.export 即可复用，可断点续跑（已存在 ZIP 自动跳过），--reexport 先清空阶段目录再全量重导。
//
// 用法：
//   node scripts/event-export.mjs <spec.json> [--stage <Name>] [--reexport]
//   pnpm event:export fixtures/events/cologne-major-2026/spec.json --stage Stage3
//
// spec.export 形如：
//   { "outRoot": "fixtures/demos/pro/IEM-Cologne-Major-2026",
//     "stages": [ { "stage": "Stage1", "sources": ["~/Downloads/iem-cologne-major-2026-stage-1-*.rar"] }, ... ] }
import { execFile as execFileCb, execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXTRACT_CONCURRENCY = 4;
const EXPORT_WORKERS = 4;

function fail(message) {
  console.error(message);
  process.exit(2);
}

function resolveCs2dfBin() {
  const envBin = process.env.CS2DF_BIN?.trim();
  if (envBin) {
    if (existsSync(envBin)) return envBin;
    try {
      return execFileSync('which', [envBin], { encoding: 'utf8' }).trim();
    } catch {
      fail(`错误：CS2DF_BIN 不可用：${envBin}`);
    }
  }
  try {
    const found = execFileSync('which', ['cs2df'], { encoding: 'utf8' }).trim();
    if (found) return found;
  } catch {
    // fall through to download instructions
  }
  fail(
    [
      '错误：未找到原生 cs2df v5.0.0 二进制（已检查 CS2DF_BIN 与 PATH）。',
      '请从 GitHub Releases 下载对应平台产物并加入 PATH 或设置 CS2DF_BIN：',
      '  https://github.com/Starfie1d1272/cs2-demo-format/releases/tag/v5.0.0',
      '  - macOS (Apple Silicon): cs2df-v5.0.0-aarch64-apple-darwin.tar.gz',
      '  - Linux (x86_64):        cs2df-v5.0.0-x86_64-unknown-linux-gnu.tar.gz',
      '  - Windows (x86_64):      cs2df-v5.0.0-x86_64-pc-windows-msvc.zip',
      '示例：',
      "  gh release download v5.0.0 -R Starfie1d1272/cs2-demo-format -p 'cs2df-v5.0.0-*.tar.gz'",
      '  export CS2DF_BIN=/path/to/cs2df',
    ].join('\n'),
  );
}

const args = process.argv.slice(2);
const specPath = args.find((a) => !a.startsWith('--'));
const reexport = args.includes('--reexport');
const stageFilter = (() => {
  const i = args.indexOf('--stage');
  return i >= 0 ? args[i + 1] : null;
})();
if (!specPath)
  fail('用法：node scripts/event-export.mjs <spec.json> [--stage <Name>] [--reexport]');

const cs2dfBin = resolveCs2dfBin();
const spec = JSON.parse(readFileSync(resolve(specPath), 'utf8'));
const exp = spec.export;
if (!exp?.outRoot || !Array.isArray(exp.stages)) {
  fail(`spec 缺少 export.outRoot / export.stages：${specPath}`);
}

const expandHome = (p) => (p.startsWith('~') ? join(homedir(), p.slice(1)) : p);
const outRootAbs = (() => {
  const r = expandHome(exp.outRoot);
  return r.startsWith('/') ? r : join(REPO, r);
})();

// 极简 glob：仅末段含 * / ?，按目录 readdir + 正则匹配。覆盖本仓库所有源命名。
function expandGlob(pattern) {
  const full = expandHome(pattern);
  const abs = full.startsWith('/') ? full : join(REPO, full);
  const dir = dirname(abs);
  const base = abs.slice(dir.length + 1);
  if (!/[*?]/.test(base)) return existsSync(abs) ? [abs] : [];
  if (!existsSync(dir)) return [];
  const rx = new RegExp(
    `^${base
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')}$`,
  );
  return readdirSync(dir)
    .filter((n) => rx.test(n))
    .sort()
    .map((n) => join(dir, n));
}

// .dem 原名 → 干净 base：去 -pN 分段后缀、去常见赛事/HLTV 前缀，sanitize 成 [a-z0-9-]。
function cleanBase(demPath) {
  return basename(demPath, '.dem')
    .replace(/-p\d+$/, '')
    .replace(/^[a-z-]*-stage-\d+-/, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function findDemsRecursive(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findDemsRecursive(full));
    else if (entry.isFile() && entry.name.endsWith('.dem')) out.push(full);
  }
  return out.sort();
}

function writeDateSidecar(stageDir, name, demPaths) {
  let minMs = Infinity;
  for (const d of demPaths) {
    try {
      const mtimeMs = statSync(d).mtimeMs;
      if (mtimeMs < minMs) minMs = mtimeMs;
    } catch {
      // ignore stat failure on individual part
    }
  }
  if (Number.isFinite(minMs)) {
    const iso = new Date(minMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
    writeFileSync(join(stageDir, `${name}.date`), `${iso}\n`);
  }
}

function moveFile(src, dest) {
  try {
    renameSync(src, dest);
  } catch (err) {
    if (err && err.code === 'EXDEV') {
      copyFileSync(src, dest);
      rmSync(src, { force: true });
    } else {
      throw err;
    }
  }
}

async function runBounded(items, concurrency, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

let totalSources = 0;
let totalFail = 0;

for (const stageDef of exp.stages) {
  if (stageFilter && stageDef.stage !== stageFilter) continue;
  const stageDir = join(outRootAbs, stageDef.stage);
  console.log(`\n========== ${stageDef.stage} ==========`);

  if (reexport && existsSync(stageDir)) {
    for (const n of readdirSync(stageDir)) {
      if (n.endsWith('.zip') || n.endsWith('.date')) rmSync(join(stageDir, n));
    }
    console.log(`  · --reexport：已清空 ${stageDef.stage}/ 的旧 zip/date`);
  }

  let sources = [...new Set((stageDef.sources ?? []).flatMap(expandGlob))];
  // 路由规则（优先级降序）：
  //   1. matchIds — 精确匹配 demo hash 或 URL slug 尾段（同一对阵多阶段时必用）
  //   2. pairs（白名单）/excludePairs（黑名单）— 归一化对阵 "a|b"（字母序）
  // 三者都未定义 → 该阶段收取全部匹配源。
  const normTeam = (s) =>
    String(s)
      .toLowerCase()
      .replace(/\b(gaming|esports|team)\b/g, '')
      .replace(/[^a-z0-9]/g, '');
  const archiveStem = (f) =>
    f
      .split('/')
      .at(-1)
      .replace(/\.(rar|dem)$/i, '');
  const eventSlug = spec.event?.slug ?? '';
  const eventPrefix = eventSlug
    ? new RegExp(`^${eventSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-`, 'i')
    : null;
  const eventSuffix = eventSlug
    ? new RegExp(`-${eventSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*$`, 'i')
    : null;
  const matchSlugOf = (f) => {
    let stem = archiveStem(f);
    if (eventPrefix) stem = stem.replace(eventPrefix, '');
    stem = stem.replace(/-bo\d.*$/i, '');
    if (eventSuffix) stem = stem.replace(eventSuffix, '');
    return stem;
  };
  const hashOfArchive = (f) => {
    const m = archiveStem(f).match(/-([a-f0-9]{6,})$/i);
    return m ? m[1] : null;
  };
  const pairOf = (file) => {
    const slug = matchSlugOf(file);
    if (!slug.includes('-vs-')) return null;
    const [a, b] = slug.split('-vs-');
    if (!a || !b) return null;
    return [normTeam(a), normTeam(b)].sort().join('|');
  };
  // 1) matchIds（精确；demo hash 或 slug "aurora-vs-g2"）
  if (Array.isArray(stageDef.matchIds) && stageDef.matchIds.length > 0) {
    const ids = new Set(stageDef.matchIds);
    sources = sources.filter((s) => {
      const slug = matchSlugOf(s),
        stem = archiveStem(s),
        h = hashOfArchive(s);
      return ids.has(slug) || ids.has(stem) || (h && ids.has(h));
    });
  }
  // 2) pairs（对阵白名单；未定义或空则跳过此筛选）
  if (Array.isArray(stageDef.pairs) && stageDef.pairs.length > 0) {
    const allow = new Set(stageDef.pairs.map((p) => p.split('|').map(normTeam).sort().join('|')));
    sources = sources.filter((s) => {
      const p = pairOf(s);
      return p && allow.has(p);
    });
  }
  // 3) excludePairs（对阵黑名单）
  if (Array.isArray(stageDef.excludePairs) && stageDef.excludePairs.length > 0) {
    const deny = new Set(
      stageDef.excludePairs.map((p) => p.split('|').map(normTeam).sort().join('|')),
    );
    sources = sources.filter((s) => {
      const p = pairOf(s);
      return !(p && deny.has(p));
    });
  }
  if (sources.length === 0) {
    console.log(`  · 无匹配源（globs: ${(stageDef.sources ?? []).join(', ')}），跳过`);
    continue;
  }

  mkdirSync(stageDir, { recursive: true });
  const tmpStage = mkdtempSync(join(tmpdir(), 'dak-event-export-'));
  const extractRoot = join(tmpStage, 'extracted');
  const batchDir = join(tmpStage, 'batch');
  mkdirSync(extractRoot, { recursive: true });
  mkdirSync(batchDir, { recursive: true });

  try {
    const directDems = [];
    const archives = [];
    for (const src of sources) {
      totalSources += 1;
      if (src.toLowerCase().endsWith('.dem')) directDems.push(src);
      else archives.push(src);
    }

    const extractedDems = [...directDems];
    await runBounded(archives, EXTRACT_CONCURRENCY, async (src, idx) => {
      console.log(`[解压 ${idx + 1}/${archives.length}] ${basename(src)}`);
      const subDir = join(extractRoot, `src-${idx}`);
      mkdirSync(subDir, { recursive: true });
      try {
        await execFile('unar', ['-q', '-o', subDir, src]);
        const dems = findDemsRecursive(subDir);
        if (dems.length === 0) {
          console.error(`!! 未找到 .dem：${src}`);
          totalFail += 1;
          return;
        }
        extractedDems.push(...dems);
      } catch (err) {
        console.error(`!! 解压失败：${src} (${err?.message ?? err})`);
        totalFail += 1;
      }
    });

    const prefix = stageDef.prefix ? `${stageDef.prefix}-` : '';
    const groups = new Map();
    for (const demPath of extractedDems) {
      const targetName = `${prefix}${cleanBase(demPath)}`;
      if (!groups.has(targetName)) groups.set(targetName, []);
      groups.get(targetName).push(demPath);
    }

    const pendingTargets = [];
    for (const [targetName, parts] of groups.entries()) {
      parts.sort();
      writeDateSidecar(stageDir, targetName, parts);
      const outZip = join(stageDir, `${targetName}.zip`);
      if (existsSync(outZip)) {
        console.log(`  · 跳过（已存在）：${stageDef.stage}/${targetName}.zip`);
        continue;
      }
      pendingTargets.push(targetName);
      if (parts.length === 1) {
        const dest = join(batchDir, `${targetName}.dem`);
        try {
          symlinkSync(parts[0], dest);
        } catch {
          copyFileSync(parts[0], dest);
        }
      } else {
        console.log(`  → 待合并 ${parts.length} 段 → ${stageDef.stage}/${targetName}.zip`);
        for (let i = 0; i < parts.length; i += 1) {
          const dest = join(batchDir, `${targetName}-p${i + 1}.dem`);
          try {
            symlinkSync(parts[i], dest);
          } catch {
            copyFileSync(parts[i], dest);
          }
        }
      }
    }

    if (pendingTargets.length > 0) {
      const compressLevel = String(stageDef.compressLevel ?? exp.compressLevel ?? 9);
      console.log(
        `\n[批量导出] ${pendingTargets.length} 场 → ${stageDef.stage}/ (workers=${EXPORT_WORKERS}, compress=${compressLevel})`,
      );
      try {
        execFileSync(
          cs2dfBin,
          [
            'export-batch',
            batchDir,
            '--research',
            '--compress-level',
            compressLevel,
            '--workers',
            String(EXPORT_WORKERS),
          ],
          { stdio: 'inherit' },
        );
      } catch {
        // export-batch may partially succeed; collect any generated zips below
      }

      for (const targetName of pendingTargets) {
        const generatedZip = join(batchDir, `${targetName}.zip`);
        const finalZip = join(stageDir, `${targetName}.zip`);
        if (existsSync(generatedZip)) {
          moveFile(generatedZip, finalZip);
        } else {
          console.error(`!! 导出失败：${stageDef.stage}/${targetName}.zip`);
          totalFail += 1;
        }
      }
    }
  } finally {
    rmSync(tmpStage, { recursive: true, force: true });
  }
}

// 校验：统计各阶段 zip 数与 exporter 版本分布
console.log(`\n========== 校验 ==========`);
console.log(`处理源 ${totalSources} 个，失败 ${totalFail}`);
for (const stageDef of exp.stages) {
  if (stageFilter && stageDef.stage !== stageFilter) continue;
  const stageDir = join(outRootAbs, stageDef.stage);
  if (!existsSync(stageDir)) continue;
  const zips = readdirSync(stageDir).filter((n) => n.endsWith('.zip'));
  const versions = {};
  for (const z of zips) {
    try {
      const out = execFileSync('unzip', ['-p', join(stageDir, z), 'manifest.json'], {
        encoding: 'utf8',
      });
      const m = out.match(/"version"\s*:\s*"([0-9.]+)"/);
      const v = m ? m[1] : '?';
      versions[v] = (versions[v] ?? 0) + 1;
    } catch {
      versions['?'] = (versions['?'] ?? 0) + 1;
    }
  }
  const dist = Object.entries(versions)
    .map(([v, c]) => `${c}×${v}`)
    .join(' ');
  console.log(`  ${stageDef.stage}: ${zips.length} zip${dist ? ` (${dist})` : ''}`);
}
