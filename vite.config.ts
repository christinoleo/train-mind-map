import preact from "@preact/preset-vite";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
  plugins: [preact()],
  server: {
    port: 8080,
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
