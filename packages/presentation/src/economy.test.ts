import { describe, expect, it } from "vitest";
import { economyLabelCn } from "./economy";

describe("economyLabelCn", () => {
  it("maps known economy types to presentation labels", () => {
    expect(economyLabelCn("full")).toBe("全枪全弹");
    expect(economyLabelCn("ECO")).toBe("纯ECO");
    expect(economyLabelCn("conversion")).toBe(economyLabelCn("full"));
  });

  it("passes through unknowns and empties", () => {
    expect(economyLabelCn(null)).toBe("");
    expect(economyLabelCn("mystery")).toBe("mystery");
  });
});
