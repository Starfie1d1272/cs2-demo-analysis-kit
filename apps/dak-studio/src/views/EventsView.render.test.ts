import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { stagesForPreset } from "../lib/event-maker";
import { ElimBracket } from "@cs2dak/react";
import type { ElimModel } from "@cs2dak/contract";

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
    expect(html).toContain("stu-bracket-edge-loss");
    expect(html).toContain("败者进入");
  });
});
