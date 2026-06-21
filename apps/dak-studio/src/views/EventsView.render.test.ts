import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { stagesForPreset } from "../lib/event-maker";
import { BracketConnections } from "./EventsView";

describe("赛事 bracket 连线", () => {
  it("双败按 lane 分区，并渲染胜者实线与败者虚线 connector", () => {
    const stage = stagesForPreset("double_elim")[0]!;
    const html = renderToStaticMarkup(createElement(BracketConnections, { stage, series: [] }));
    expect(html).toContain("胜者组");
    expect(html).toContain("败者组");
    expect(html).toContain("总决赛");
    expect(html).toContain("stu-bracket-edge-loss");
    expect(html).toContain("败者进入");
  });
});
