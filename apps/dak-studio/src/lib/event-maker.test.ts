import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import JSZip from "jszip";
import { buildEventPackage, deriveEventTeams, resourceFromFile, seriesSkeletonForPreset, slugifyEventName, stagesForPreset, swissBuckets } from "./event-maker";

describe("赛事资源制作器", () => {
  it("中文赛事名使用稳定非空 fallback slug", () => {
    expect(slugifyEventName("科隆特锦赛")).toMatch(/^event-[a-z0-9]+$/);
    expect(slugifyEventName("科隆特锦赛")).toBe(slugifyEventName("科隆特锦赛"));
    expect(slugifyEventName("科隆 Major 2026")).toBe("major-2026");
  });
  it("Major 预设为三轮瑞士轮加单败淘汰，第三阶段全部 BO3", () => {
    const stages = stagesForPreset("major");
    expect(stages.map((stage) => stage.type)).toEqual(["swiss", "swiss", "swiss", "single_elim"]);
    expect(stages[2]?.matchFormat).toBe("bo3");
    expect(stages[3]?.finalFormat).toBe("bo5");
  });

  it("淘汰赛框架预建定额系列；瑞士轮按战绩组逐场添加（不预生成）", () => {
    const stages = stagesForPreset("major");
    const rows = seriesSkeletonForPreset("major", stages);
    const playoff = stages.find((stage) => stage.key === "playoff")!;
    // 瑞士轮阶段不预生成系列：战绩组在框架板上逐场添加
    expect(rows.filter((row) => row.stage === "stage1")).toHaveLength(0);
    expect(rows.filter((row) => row.stage === "playoff")).toHaveLength(7);
    expect(playoff.bracketNodes?.find((node) => node.id === "r1-m1")?.nextWinNodeId).toBe("r2-m1");
    expect(rows.find((row) => row.key === "playoff-r3-m1")).toMatchObject({ status: "finished", bracketNodeId: "r3-m1", entryRound: "决赛" });
  });

  it("瑞士轮战绩组：3 胜进 / 3 负汰的 (w-l) 网格，按轮次排列", () => {
    const buckets = swissBuckets();
    expect(buckets).toHaveLength(9); // 3×3：0-0 … 2-2
    expect(buckets.filter((b) => b.round === 1).map((b) => b.label)).toEqual(["0-0"]);
    expect(buckets.filter((b) => b.round === 3).map((b) => b.label).sort()).toEqual(["0-2", "1-1", "2-0"]);
    expect(buckets.every((b) => b.kind === "bucket")).toBe(true);
  });

  it("双败模板包含胜者、败者和总决赛的真实去向", () => {
    const stage = stagesForPreset("double_elim")[0]!;
    expect(stage.bracketNodes?.find((node) => node.id === "w2-m1")).toMatchObject({ nextWinNodeId: "w3-m1", nextLossNodeId: "l2-m2" });
    expect(stage.bracketNodes?.find((node) => node.id === "l4-m1")?.nextWinNodeId).toBe("g1");
    expect(seriesSkeletonForPreset("double_elim", [stage]).at(-1)).toMatchObject({ bracketNodeId: "g1", entryRound: "总决赛" });
  });

  it("队伍由已附 demo 派生（demo 优先），按出现顺序去重", async () => {
    const bytes = await readFile(resolve("fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip"));
    const resource = await resourceFromFile(new File([bytes], "ancient.zip", { type: "application/zip" }));
    const teams = deriveEventTeams([{
      key: "s", stage: "main", round: 1, entryRound: null, status: "finished", format: "bo1",
      teamAName: resource.teamAName, teamBName: resource.teamBName, scheduledAt: "", veto: null, resources: [resource],
    }]);
    expect(teams).toEqual([resource.teamAName, resource.teamBName]);
  });

  it("从真实 v3 ZIP 生成可导入资产，并按系列赛 A/B 顺序校正比分", async () => {
    const bytes = await readFile(resolve("fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip"));
    const resource = await resourceFromFile(new File([bytes], "ancient.zip", { type: "application/zip" }));
    const { eventPackage, blob } = await buildEventPackage({
      slug: "maker-test",
      name: "Maker Test",
      kind: "test",
      stages: stagesForPreset("single_elim"),
      series: [{
        key: "final",
        stage: "main",
        round: 1,
        entryRound: "final",
        status: "finished",
        format: "bo1",
        teamAName: resource.teamBName,
        teamBName: resource.teamAName,
        scheduledAt: "",
        veto: null,
        resources: [resource],
      }],
    });
    expect(eventPackage.series[0]?.maps[0]).toMatchObject({ scoreA: resource.scoreB, scoreB: resource.scoreA });
    expect(eventPackage.series[0]?.scheduledAt).toBeNull();
    expect(eventPackage.series[0]?.completedAt).toBe(resource.occurredAt);
    const archive = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(archive.file("event-package.json")).not.toBeNull();
    expect(Object.keys(archive.files).some((name) => name.startsWith("maps/") && name.endsWith(".zip"))).toBe(true);
  });
});
