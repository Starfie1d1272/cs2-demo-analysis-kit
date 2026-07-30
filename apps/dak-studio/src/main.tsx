import React from "react";
import { createRoot } from "react-dom/client";
import { waitForNativeStorageBridge } from "./lib/storage/bootstrap";
import "@cs2dak/react/theme.css";
import "./studio.css";

const rootElement = document.getElementById("root") as HTMLElement;

waitForNativeStorageBridge()
  .then(async () => {
    // App 的依赖里有若干模块级 store。必须在 bridge 就绪后再加载整个模块图，
    // 否则静态 import 会早于上面的等待执行，并把存储单例锁定为 IndexedDB。
    const { App } = await import("./App");
    createRoot(rootElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  })
  .catch((error: unknown) => {
    rootElement.textContent = `DAK Studio 启动失败：${error instanceof Error ? error.message : String(error)}`;
  });
