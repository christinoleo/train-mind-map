import js from "@eslint/js";
import prettier from "eslint-plugin-prettier/recommended";
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

export default tseslint.config(
  { ignores: ["dist", ".claude", "_bmad", "_bmad-output", ".worktree"] },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      prettier,
    ],
    files: ["**/*.{js,ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },
  {
    files: ["src/sim/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "pixi.js",
              message: "src/sim/ must not depend on rendering.",
            },
            { name: "preact", message: "src/sim/ must not depend on UI." },
          ],
          patterns: [
            {
              group: ["pixi.js/*", "@pixi/*", "preact/*", "@preact/*"],
              message: "src/sim/ must not depend on rendering or UI.",
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
