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

it("preserves native object failure details and request correlation", () => {
  expect(explainError({ code: "NEW_CODE", status: 422, message: "Rejected", requestId: "req-9", cause: "Roster mismatch" }, { fileId: "file-2", stage: "submit", attempt: 3 })).toMatchObject({ code: "NEW_CODE", status: 422, requestId: "req-9", message: "Rejected", cause: "Roster mismatch", fileId: "file-2", stage: "submit", attempt: 3 });
});


it.each(["READ", "WRITE", "DELETE"])("routes native credential %s errors to OS permissions", (operation) => {
  const result = explainError(new Error(`[Errno 5] CREDENTIAL_${operation}：Windows 安全存储拒绝操作`), { stage: "connect" });
  expect(result.code).toBe(`CREDENTIAL_${operation}`);
  expect(result.message).toContain("Errno 5");
  expect(result.action).toContain("凭据管理器");
  expect(result.action).toContain("钥匙串");
  expect(result.stage).toBe("connect");
});
