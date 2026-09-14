import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { stagesForPreset } from "../lib/event-maker";
import { ElimBracket } from "@cs2dak/react";
import type { ElimModel, EventStage } from "@cs2dak/contract";
import { StageContent } from "./EventsView";

describe("赛事 bracket 连线", () => {
  it("双败按 lane 分区，并渲染胜者实线与败者虚线 connector", () => {
    const stage = stagesForPreset("double_elim")[0]!;
    const nodes = (stage.bracketNodes ?? []).map((node) => ({
      id: node.id,
      round: node.round,
      lane: node.lane,
      label: node.label,
      nextWinNodeId: node.nextWinNodeId,
      nextLossNodeId: node.nextLossNodeId,
    }));
    const model: ElimModel = {
      columns: [],
      nodes,
    };
    const html = renderToStaticMarkup(createElement(ElimBracket, { model }));
    expect(html).toContain("胜者组");
    expect(html).toContain("败者组");
    expect(html).toContain("总决赛");
    expect(html).toContain("dak-bracket-edge-loss");
    expect(html).toContain("败者进入");
  });

  it("remote Swiss 没有官方 standings 时不从本地 series 推导结果", () => {
    const stage = { key: "swiss", name: "瑞士轮", type: "swiss", teamCount: 16, advanceCount: 8 } as EventStage;
    const html = renderToStaticMarkup(createElement(StageContent, { stage, series: [], remote: true, onSelectSeries: () => undefined }));

    expect(html).toContain("RivalHub 尚未提供官方积分榜");
    expect(html).toContain("排名与 tiebreak 只显示官方 read model");
    expect(html).not.toContain("第 0 轮");
  });

  it("remote elimination 没有 bracketNodes 时明确缺少官方结构", () => {
    const stage = { key: "playoff", name: "淘汰赛", type: "single_elim", teamCount: 8, advanceCount: 1 } as EventStage;
    const html = renderToStaticMarkup(createElement(StageContent, { stage, series: [], remote: true, onSelectSeries: () => undefined }));

    expect(html).toContain("RivalHub 尚未提供官方 bracket 结构");
    expect(html).toContain("compact match index");
  });
});
