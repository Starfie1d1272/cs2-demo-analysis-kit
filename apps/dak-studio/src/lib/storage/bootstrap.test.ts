import { afterEach, describe, expect, it, vi } from "vitest";
import { isDesktopRuntime, waitForNativeStorageBridge } from "./bootstrap";

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { window?: unknown }).window;
});

function runtime(url: string) {
  const target = new EventTarget();
  return {
    location: { href: url },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatch: (type: string) => target.dispatchEvent(new Event(type)),
  };
}

describe("native storage bootstrap", () => {
  it("only treats the explicitly marked packaged URL as desktop", () => {
    expect(isDesktopRuntime("http://127.0.0.1:51780/index.html?desktop=1")).toBe(true);
    expect(isDesktopRuntime("http://127.0.0.1:5178/")).toBe(false);
  });

  it("does not delay the browser development runtime", async () => {
    await expect(waitForNativeStorageBridge(runtime("http://127.0.0.1:5178/"))).resolves.toBeUndefined();
  });

  it("fails closed instead of silently selecting IndexedDB when the desktop bridge is absent", async () => {
    vi.useFakeTimers();
    const waiting = waitForNativeStorageBridge(
      runtime("http://127.0.0.1:51780/index.html?desktop=1"),
      50,
    );
    const assertion = expect(waiting).rejects.toThrow("等待原生存储桥超时");
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });
});
