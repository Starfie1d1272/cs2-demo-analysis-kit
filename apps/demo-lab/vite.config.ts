import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative asset paths so the built bundle loads from file:// inside the
  // Keep assets relative so the built lab can be opened as a static artifact.
  base: "./",
  plugins: [react()],
  server: {
    port: 5177
  }
});
