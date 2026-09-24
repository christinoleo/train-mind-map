import preact from "@preact/preset-vite";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
  plugins: [preact()],
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
  },
});
