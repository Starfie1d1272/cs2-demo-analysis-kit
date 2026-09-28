import { describe, expect, it } from "vitest";
import { RivalHubHttpError } from "@cs2dak/rivalhub-upload";
import { explainError } from "./errors";

describe("user-facing upload error guidance", () => {
  it("explains site-address errors", () => {
    expect(explainError(new RivalHubHttpError(404, "Not found")).action).toContain("站点主地址");
  });
  it("routes authorization problems to reconnect or check permissions", () => {
    expect(explainError(new RivalHubHttpError(401, "Unauthorized")).action).toContain("重新授权");
    expect(explainError(new RivalHubHttpError(403, "Forbidden")).action).toContain("上传权限");
  });
  it("directs data conflicts to the event page", () => {
    expect(explainError(new RivalHubHttpError(409, "Conflict")).action).toContain("选手名单");
  });
});
