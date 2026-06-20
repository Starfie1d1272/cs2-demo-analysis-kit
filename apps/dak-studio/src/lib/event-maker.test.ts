import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import JSZip from "jszip";
import { buildEventPackage, normalizeTeamNames, resourceFromFile, stagesForPreset } from "./event-maker";

describe("赛事资源制作器", () => {
  it("Major 预设为三轮瑞士轮加单败淘汰，第三阶段全部 BO3", () => {
    const stages = stagesForPreset("major");
    expect(stages.map((stage) => stage.type)).toEqual(["swiss", "swiss", "swiss", "single_elim"]);
    expect(stages[2]?.matchFormat).toBe("bo3");
    expect(stages[3]?.finalFormat).toBe("bo5");
  });

  it("队伍输入按换行或逗号拆分并去重", () => {
    expect(normalizeTeamNames("Falcons\nVitality, Falcons")).toEqual(["Falcons", "Vitality"]);
  });

  it("从真实 v3 ZIP 生成可导入资产，并按系列赛 A/B 顺序校正比分", async () => {
    const bytes = await readFile(resolve("fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip"));
    const resource = await resourceFromFile(new File([bytes], "ancient.zip", { type: "application/zip" }));
    const { eventPackage, blob } = await buildEventPackage({
      slug: "maker-test",
      name: "Maker Test",
      kind: "test",
      stages: stagesForPreset("single_elim"),
      teams: [resource.teamBName, resource.teamAName],
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
    const archive = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(archive.file("event-package.json")).not.toBeNull();
    expect(Object.keys(archive.files).some((name) => name.startsWith("maps/") && name.endsWith(".zip"))).toBe(true);
  });
});
