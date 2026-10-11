import { describe, expect, it, vi } from "vitest";
import { completePairing } from "./pairing";

function deferred() {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>(done => { resolve = done; });
  return { promise, resolve };
}
describe("authorization attempt ownership", () => {
  it.each(["save", "events"])("ignores cancellation during %s and rolls back only its pairing", async boundary => {
    const pending = deferred(); let current = true;
    const api = { save_connection: vi.fn(async () => boundary === "save" ? pending.promise : true), configure: vi.fn(async () => true) };
    const events = vi.fn(async () => pending.promise);
    const result = completePairing(api, events, () => current, "https://example.test", "old-pair", "private-token");
    await Promise.resolve(); await Promise.resolve();
    current = false; pending.resolve(true);
    expect(await result).toBe(false);
    expect(api.configure).toHaveBeenCalledWith("https://example.test", "old-pair");
    if (boundary === "save") expect(events).not.toHaveBeenCalled();
  });
  it("never writes a credential for an already canceled attempt", async () => {
    const api = { save_connection: vi.fn(), configure: vi.fn() };
    expect(await completePairing(api, vi.fn(), () => false, "https://example.test", "pair", "private")).toBe(false);
    expect(api.save_connection).not.toHaveBeenCalled(); expect(api.configure).not.toHaveBeenCalled();
  });
  it("leaves the owned successful authorization connected", async () => {
    const api = { save_connection: vi.fn(async () => true), configure: vi.fn() };
    expect(await completePairing(api, vi.fn(async () => {}), () => true, "https://example.test", "pair", "private")).toBe(true);
    expect(api.configure).not.toHaveBeenCalled();
  });
});
