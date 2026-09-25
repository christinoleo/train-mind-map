import preact from "@preact/preset-vite";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
  plugins: [preact()],
  // Relative asset URLs: itch.io serves the game under /html/{uploadId}/.
  // No PWA plugin and no service worker: itch's iframe supports neither (#9).
  base: "./",
  server: {
    port: 8080,
  },
  build: {
    rolldownOptions: {
      // stress.html is the rendering stress test for real phones (ticket #3).
      input: ["index.html", "stress.html"],
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Process the stylesheet, so a test can read it with `?raw`.
    css: { include: [/style\.css/] },
  },
});
