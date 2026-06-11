import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    environment: "node",
    // CI 2-core runner 处理 large ZIP 或子进程启动比本机慢一截，
    // 默认 5s 不够，cohort / CLI analyze 等需要 20–30s。
    testTimeout: 60_000,
    hookTimeout: 60_000
  }
});
