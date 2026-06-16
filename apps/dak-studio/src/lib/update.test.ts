import { afterEach, describe, expect, it, vi } from "vitest";

// update.ts 顶层 `const APP_VERSION = __APP_VERSION__`（vite define）。
// node 测试环境无此 define，先在 globalThis 注入再动态 import，避免 ReferenceError。
(globalThis as Record<string, unknown>).__APP_VERSION__ = "0.6.0";
const {
  semverLess,
  withMirror,
  parseManifest,
  checkForUpdate,
  MANIFEST_MIRRORS
} = await import("./update");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("semverLess", () => {
  it("逐段比较 X.Y.Z", () => {
    expect(semverLess("0.6.0", "0.7.0")).toBe(true);
    expect(semverLess("0.7.0", "0.7.0")).toBe(false);
    expect(semverLess("0.7.1", "0.7.0")).toBe(false);
    expect(semverLess("0.6.9", "0.7.0")).toBe(true);
    expect(semverLess("1.0.0", "0.9.9")).toBe(false);
  });
});

describe("withMirror", () => {
  it("空前缀直连，否则拼接（容忍缺尾斜杠）", () => {
    const raw = "https://github.com/o/r/releases/latest/download/latest.json";
    expect(withMirror("", raw)).toBe(raw);
    expect(withMirror("https://ghfast.top/", raw)).toBe("https://ghfast.top/" + raw);
    expect(withMirror("https://ghfast.top", raw)).toBe("https://ghfast.top/" + raw);
  });
});

describe("parseManifest", () => {
  const valid = {
    version: "0.7.0",
    notes: "首个自动更新版本",
    assets: {
      windows: {
        name: "dak-studio-windows-0.7.0.zip",
        size: 80000000,
        sha256: "ABC123",
        urls: ["https://github.com/o/r/releases/download/v0.7.0/dak-studio-windows-0.7.0.zip"]
      }
    }
  };

  it("解析合法 manifest 并把 sha256 归一化为小写", () => {
    const m = parseManifest(valid);
    expect(m?.version).toBe("0.7.0");
    expect(m?.assets.windows?.sha256).toBe("abc123");
    expect(m?.assets.windows?.urls).toHaveLength(1);
  });

  it("version 非法或缺失结构 → null", () => {
    expect(parseManifest(null)).toBeNull();
    expect(parseManifest({ version: "latest" })).toBeNull();
    expect(parseManifest({ version: "0.7" , assets: {} })).toBeNull();
  });

  it("资产字段不全时丢弃该平台而非整体失败", () => {
    const m = parseManifest({ version: "0.7.0", assets: { windows: { name: "x.zip" } } });
    expect(m).not.toBeNull();
    expect(m?.assets.windows).toBeUndefined();
  });
});

describe("checkForUpdate", () => {
  function stubFetchSequence(handler: (url: string) => Response | null) {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const res = handler(url);
      if (res) return res;
      throw new Error("network");
    }));
  }
  const manifestBody = JSON.stringify({
    version: "0.7.0",
    notes: "test",
    assets: {
      windows: { name: "dak-studio-windows-0.7.0.zip", size: 1, sha256: "deadbeef", urls: ["https://x/a.zip"] }
    }
  });

  it("第一个镜像失败时转移到下一个", async () => {
    vi.stubGlobal("navigator", { userAgent: "windows nt" });
    let calls = 0;
    stubFetchSequence((url) => {
      calls++;
      // 直连（空前缀，第一个）失败，第二个镜像成功
      if (url.startsWith(MANIFEST_MIRRORS[1])) return new Response(manifestBody, { status: 200 });
      return null; // 抛错 → 触发转移
    });
    const info = await checkForUpdate();
    expect(info?.latest).toBe("0.7.0");
    expect(info?.asset?.name).toBe("dak-studio-windows-0.7.0.zip");
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it("已是最新版本返回 null", async () => {
    vi.stubGlobal("navigator", { userAgent: "windows nt" });
    const sameVer = manifestBody.replace("0.7.0", "0.6.0");
    stubFetchSequence(() => new Response(sameVer, { status: 200 }));
    expect(await checkForUpdate()).toBeNull();
  });

  it("非 Windows 平台仍报新版但不带一键更新资产", async () => {
    vi.stubGlobal("navigator", { userAgent: "x11 linux" });
    stubFetchSequence(() => new Response(manifestBody, { status: 200 }));
    const info = await checkForUpdate();
    expect(info?.latest).toBe("0.7.0");
    expect(info?.asset).toBeUndefined();
  });

  it("所有镜像失败 → 退回 GitHub API 兜底", async () => {
    vi.stubGlobal("navigator", { userAgent: "windows nt" });
    stubFetchSequence((url) => {
      if (url.includes("api.github.com")) {
        return new Response(JSON.stringify({ tag_name: "v0.7.0", html_url: "https://gh/page" }), { status: 200 });
      }
      return null; // 所有 manifest 镜像失败
    });
    const info = await checkForUpdate();
    expect(info?.latest).toBe("0.7.0");
    expect(info?.url).toBe("https://gh/page");
    expect(info?.asset).toBeUndefined();
  });
});
