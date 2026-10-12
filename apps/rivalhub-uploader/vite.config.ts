import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { desktopNoticeAssets } from "../../scripts/distribution-notices.mjs";
export default defineConfig({
  base: "./",
  plugins: [react(), { name: "dak-upstream-notices", generateBundle() {
    for (const asset of desktopNoticeAssets()) this.emitFile({ type: "asset", ...asset });
  } }],
  server: { host: "127.0.0.1", port: 5180 },
});
