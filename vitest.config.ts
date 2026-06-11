import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    environment: "node",
    // CI 2-core runner 处理 fixture ZIP（3 场 cohort、sanitized）比本机慢一截，
    // 默认 5s 不够，cohort 全链路测试需要约 30–45s。
    testTimeout: 60_000,
    hookTimeout: 60_000
  }
});
