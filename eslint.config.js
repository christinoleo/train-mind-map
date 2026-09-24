import js from "@eslint/js";
import prettier from "eslint-plugin-prettier/recommended";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

// Layer boundaries (architecture §Estrutura do Projeto): the simulation stays
// pure and deterministic, so src/sim/ may import only sim/, data/ and config/.
const SIM_FORBIDDEN_LAYERS = [
  "render",
  "ui",
  "input",
  "audio",
  "platform",
  "debug",
];

export default defineConfig(
  { ignores: ["dist", ".claude", "_bmad", "_bmad-output", ".worktree"] },
  {
    extends: [js.configs.recommended, tseslint.configs.recommended, prettier],
    files: ["**/*.{js,ts,tsx}"],
  },
  {
    files: ["src/sim/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // Any bare package (pixi.js, preact, idb-keyval, ...) is off limits.
              regex: "^[^.]",
              message: "src/sim/ must not depend on external packages.",
            },
            {
              group: SIM_FORBIDDEN_LAYERS.flatMap((layer) => [
                `**/${layer}`,
                `**/${layer}/**`,
              ]),
              message: "src/sim/ may import only sim/, data/ and config/.",
            },
          ],
        },
      ],
    },
  },
);
