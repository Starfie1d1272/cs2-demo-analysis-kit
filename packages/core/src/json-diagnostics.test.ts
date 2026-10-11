import { expect, it } from "vitest";
import { jsonParseFailureCause } from "./json-diagnostics";

it.each(["opaque_private_payload_sentinel", "sk_live_synthetic_private_payload"])("projects real JSON.parse failure without copying %s or its excerpt", payload => {
  let error: unknown;
  try { JSON.parse(payload); } catch (failure) { error = failure; }
  expect(error).toBeInstanceOf(SyntaxError);
  const projected = jsonParseFailureCause(error);
  expect(projected).toEqual({ name: "SyntaxError", message: "SyntaxError: unexpected token (location unavailable)" });
  expect(JSON.stringify(projected)).not.toContain(payload.slice(0, 8));
});
it("retains safe decimal coordinates and parser category from a real SyntaxError", () => {
  let error: unknown;
  try { JSON.parse('{\n"x":1,\n}'); } catch (failure) { error = failure; }
  expect(jsonParseFailureCause(error)).toEqual({ name: "SyntaxError", message: "SyntaxError: expected quoted property name (position 9, line 3, column 1)" });
});
it("does not follow a SyntaxError cause/stack or hostile message getter", () => {
  const error = new SyntaxError("opaque_private_payload_sentinel", { cause: new Error("sk_live_synthetic_secret") });
  error.stack = "private stack excerpt";
  expect(JSON.stringify(jsonParseFailureCause(error))).not.toMatch(/opaque_|sk_live_|private/);
  Object.defineProperty(error, "message", { get() { throw new Error("opaque_private_payload_sentinel"); } });
  expect(jsonParseFailureCause(error)).toEqual({ name: "SyntaxError", message: "SyntaxError: invalid JSON syntax (location unavailable)" });
});
