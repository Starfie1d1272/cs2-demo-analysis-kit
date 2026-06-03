import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative asset paths so the built bundle loads from file:// inside the
  // pywebview GUI viewer window, not just from an http server.
  base: "./",
  plugins: [react()],
  server: {
    port: 5177
  }
});
