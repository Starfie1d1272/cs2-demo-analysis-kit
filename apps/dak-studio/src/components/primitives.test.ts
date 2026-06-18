import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MetricInfo } from "./primitives";

describe("MetricInfo", () => {
  it("没有说明内容时不渲染空信息按钮", () => {
    expect(renderToStaticMarkup(React.createElement(MetricInfo, { note: "" }))).toBe("");
    expect(renderToStaticMarkup(React.createElement(MetricInfo, { note: null }))).toBe("");
  });

  it("有说明内容时渲染可聚焦 tooltip", () => {
    const html = renderToStaticMarkup(React.createElement(MetricInfo, { note: "按证据回合计算" }));
    expect(html).toContain("tabindex=\"0\"");
    expect(html).toContain("role=\"tooltip\"");
    expect(html).toContain("按证据回合计算");
  });
});
