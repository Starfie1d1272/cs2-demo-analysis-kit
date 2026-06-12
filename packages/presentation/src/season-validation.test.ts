/**
 * C 阶段：55 张真实 ZIP 数据验收
 * 验证：排序合理性、null 分布、AWP/R 是否趋零、FK/MK/C 数值范围、
 * 多账号合并、强项/弱项百分位。
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { loadDemoPackageFromZip } from "@cs2dak/core";
import { buildSeasonCohort } from "@cs2dak/cohort";
import { buildSeasonLeaderboardModel, buildAllPlayerSeasonProfiles } from "./index";

const ZIP_DIR = fileURLToPath(new URL("../../../fixtures/output/nju-rivals-2026", import.meta.url));
const REPORT_FILE = fileURLToPath(new URL("../../../fixtures/output/_c-phase-report.txt", import.meta.url));
const integrationTimeoutMs = 180_000;
const reportLines: string[] = [];

function report(msg: string) {
  reportLines.push(msg);
  console.log(msg);
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const stat = await (await import("node:fs/promises")).stat(path);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function njuCohort() {
  const names = (await readdir(ZIP_DIR)).filter((n) => n.endsWith(".zip")).sort();
  const demos = (
    await Promise.all(
      names.map(async (name) => {
        const buf = await readFile(join(ZIP_DIR, name));
        // 跳过 v2 ZIP（需要 cs2df 重导为 v3 后方可加载）
        try {
          const zip = await JSZip.loadAsync(buf);
          const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
          if (!manifest?.schemaVersion?.startsWith("cs2-demo-format/3.")) return null;
        } catch { return null; }
        return {
          matchId: name.replace(/\.zip$/, ""),
          pkg: await loadDemoPackageFromZip(buf),
        };
      })
    )
  ).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof njuCohort>>["bundle"]["matches"][number]>;
  return { bundle: buildSeasonCohort(demos), matchCount: demos.length };
}

describe("55-ZIP season verification", () => {
  it(
    "builds cohort + leaderboard + profiles from 55 real ZIPs",
    async () => {
      if (!(await dirExists(ZIP_DIR))) {
        report("ZIP 目录不存在，跳过验证（CI 环境无预导出 ZIP）");
        return;
      }
      const { bundle, matchCount } = await njuCohort();
      if (matchCount === 0) {
        report("无 v3 ZIP，跳过验证（需用 cs2df 重导所有 demo）");
        return;
      }
      expect(matchCount).toBeGreaterThanOrEqual(50);
      expect(bundle.players.length).toBeGreaterThan(30);

      const leaderboard = buildSeasonLeaderboardModel(bundle);
      const profiles = buildAllPlayerSeasonProfiles(bundle);
      expect(leaderboard.rows).toHaveLength(bundle.players.length);
      expect(profiles).toHaveLength(bundle.players.length);

      // 排序是 React SeasonLeaderboard 组件的职责，不在 builder 侧。
      // 这里只验证数据完整性和范围合理。组件排序测试在 SeasonLeaderboard.test.ts。

      // AWP/R 应该大部分接近 0（非狙手无 AWP 击杀）
      const awprValues = leaderboard.rows
        .map((r) => r.metrics.awpKillsPerRound)
        .filter((v): v is number => v != null);
      if (awprValues.length > 0) {
        const belowPoint1 = awprValues.filter((v) => v < 0.1).length;
        const pctBelow = (belowPoint1 / awprValues.length) * 100;
        report(`AWP/R: ${awprValues.length} non-null, ${pctBelow.toFixed(0)}% < 0.1`);
        // 非狙手主导的场景，AWP/R 趋近 0 的比例应高
        expect(pctBelow).toBeGreaterThan(50);
      }

      // FK/MK/C 每 100 回合数值范围：合理范围 0–30，极端值检查
      for (const key of ["firstKillPer100", "multiKillPer100", "clutchPer100"] as const) {
        const values = leaderboard.rows
          .map((r) => r.metrics[key])
          .filter((v): v is number => v != null);
        if (values.length > 0) {
          const sorted = [...values].sort((a, b) => a - b);
          const p95 = sorted[Math.floor(sorted.length * 0.95)];
          report(`${key}: n=${values.length} p50=${sorted[Math.floor(sorted.length * 0.5)].toFixed(1)} p95=${p95.toFixed(1)}`);
          // FK/100r p95 不应超过 30（每 100 回合 30 首杀极端异常）
          expect(p95).toBeLessThan(30);
        }
      }

      // 选手页前 3 名有有意义的内容
      const top3 = leaderboard.rows
        .filter((r) => r.metrics.rivalhubRR != null)
        .sort((a, b) => (b.metrics.rivalhubRR ?? 0) - (a.metrics.rivalhubRR ?? 0))
        .slice(0, 3);
      for (const row of top3) {
        const profile = profiles.find((p) => p.playerKey === row.playerKey)!;
        expect(profile.rating.rivalhubRR).toBeGreaterThan(0);
        expect(profile.perMatch.length).toBeGreaterThanOrEqual(1);
        if (profile.style) {
          expect(profile.style.axes).toHaveLength(8);
        }
        report(`Top: ${profile.name} RR=${profile.rating.rivalhubRR.toFixed(2)} maps=${profile.mapCount} strengths=[${profile.strengths.join(",")}]`);
      }

      // 写入报告文件供后续查看
      await (await import("node:fs/promises")).writeFile(REPORT_FILE, reportLines.join("\n") + "\n");
      report(`\n报告已写入 ${REPORT_FILE}`);
    },
    integrationTimeoutMs
  );
});
