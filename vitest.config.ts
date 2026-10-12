import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "apps/**/*.test.tsx", "scripts/**/*.test.ts"],
    environment: "node",
    // CI 2-core runner 处理 large ZIP 或子进程启动比本机慢一截，
    // 默认 5s 不够，真实 ZIP 导入、重建与空间 facade 可需要数十秒。
    testTimeout: 60_000,
    hookTimeout: 60_000
  }
});
