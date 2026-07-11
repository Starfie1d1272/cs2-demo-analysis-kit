import { describe, it, expect } from "vitest";
import { prepItemsToMarkdown, type PrepItem } from "./playlist.js";

describe("prepItemsToMarkdown", () => {
  it("导出 Markdown：分组 + 人工备注", () => {
    const items: PrepItem[] = [
      { id: "1", group: "对手 A 双线", matchId: "m1", mapName: "de_mirage", roundNumber: 7, note: "二楼晚 3-5 秒" },
      { id: "2", group: "对手 A 双线", matchId: "m1", mapName: "de_mirage", roundNumber: 9, note: "" },
    ];
    const md = prepItemsToMarkdown("Mirage vs Team B", items);
    expect(md).toContain("# Mirage vs Team B");
    expect(md).toContain("## 对手 A 双线");
    expect(md).toContain("- de_mirage · m1 · R7 — 二楼晚 3-5 秒");
    expect(md).toContain("- de_mirage · m1 · R9");
  });

  it("无备注行只输出回合号", () => {
    const items: PrepItem[] = [
      { id: "1", group: "测试组", matchId: "m1", roundNumber: 3, note: "" },
    ];
    const md = prepItemsToMarkdown("测试", items);
    expect(md).toContain("- m1 · R3");
    expect(md).not.toContain("—");
  });

  it("多分组各自独立", () => {
    const items: PrepItem[] = [
      { id: "1", group: "A 包", matchId: "m1", roundNumber: 1, note: "" },
      { id: "2", group: "B 包", matchId: "m1", roundNumber: 2, note: "" },
    ];
    const md = prepItemsToMarkdown("测试", items);
    expect(md).toContain("## A 包");
    expect(md).toContain("## B 包");
  });
});
