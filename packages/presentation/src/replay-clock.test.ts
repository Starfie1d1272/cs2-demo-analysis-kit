import { describe, expect, it } from "vitest";
import { deriveReplayClock, formatClockSeconds } from "./replay-clock.js";

const round = {
  freezeEndTick: 1_000,
  officialEndTick: 10_000,
  targetEndTick: 10_320,
  bomb: null,
};

describe("replay clock", () => {
  it("以 freeze end 为 1:55，并可定位到 1:35", () => {
    expect(deriveReplayClock(round, 1_000, 64)).toMatchObject({ phase: "round", secondsRemaining: 115, display: "1:55" });
    expect(deriveReplayClock(round, 1_000 + 20 * 64, 64)).toMatchObject({ phase: "round", secondsRemaining: 95, display: "1:35" });
  });

  it("下包后使用实际爆炸时长，缺失爆炸事件时回退 40 秒", () => {
    const planted = { ...round, bomb: { plantTick: 5_000, explodeTick: 5_000 + 35 * 64, defuseTick: null } };
    expect(deriveReplayClock(planted, 5_000, 64)).toMatchObject({ phase: "bomb", secondsRemaining: 35, display: "0:35" });
    expect(deriveReplayClock({ ...planted, bomb: { ...planted.bomb, explodeTick: null } }, 5_000 + 10 * 64, 64))
      .toMatchObject({ phase: "bomb", secondsRemaining: 30, display: "0:30" });
  });

  it("官方回合结束后按下一回合 start tick 显示真实赛后间隔", () => {
    expect(deriveReplayClock(round, 10_000, 64)).toMatchObject({ phase: "round-end", secondsRemaining: 5, display: "0:05" });
    expect(deriveReplayClock(round, 10_192, 64)).toMatchObject({ phase: "round-end", secondsRemaining: 2, display: "0:02" });
  });

  it("freeze 阶段显示准备，通用格式不输出裸秒", () => {
    expect(deriveReplayClock(round, 999, 64)).toMatchObject({ phase: "freeze", secondsRemaining: null, display: "准备" });
    expect(formatClockSeconds(88)).toBe("1:28");
  });
});
