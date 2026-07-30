import { getPywebviewStorageApi } from "./pywebview-adapter";

const DESKTOP_QUERY = "desktop";
const BRIDGE_EVENT = "pywebviewready";

interface BootstrapWindow {
  location: { href: string };
  addEventListener(type: string, listener: EventListener, options?: AddEventListenerOptions): void;
  removeEventListener(type: string, listener: EventListener): void;
}

export function isDesktopRuntime(url: string): boolean {
  return new URL(url).searchParams.get(DESKTOP_QUERY) === "1";
}

/**
 * 打包壳必须等 pywebview 注入原生存储桥后才能挂载 React。
 *
 * 否则第一个 `getStorage()` 会把单例永久锁定为 IndexedDB，造成界面看似可用，
 * 实际绕过桌面 SQLite/文件系统。浏览器与 Vite 开发入口不等待。
 */
export function waitForNativeStorageBridge(
  runtime: BootstrapWindow = window,
  timeoutMs = 10_000,
): Promise<void> {
  if (!isDesktopRuntime(runtime.location.href) || getPywebviewStorageApi()) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const finish = () => {
      clearTimeout(timeout);
      runtime.removeEventListener(BRIDGE_EVENT, onReady);
      if (getPywebviewStorageApi()) resolve();
      else reject(new Error("pywebview 已就绪，但原生存储桥不可用"));
    };
    const onReady: EventListener = () => finish();
    const timeout = setTimeout(() => {
      runtime.removeEventListener(BRIDGE_EVENT, onReady);
      reject(new Error("等待原生存储桥超时"));
    }, timeoutMs);
    runtime.addEventListener(BRIDGE_EVENT, onReady, { once: true });
  });
}
