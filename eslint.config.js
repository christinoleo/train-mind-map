import js from "@eslint/js";
import prettier from "eslint-plugin-prettier/recommended";
import { defineConfig } from "eslint/config";
import path from "node:path";
import tseslint from "typescript-eslint";

// Layer boundaries (architecture §Estrutura do Projeto): the simulation stays
// pure and deterministic, so src/sim/ may import only sim/, data/ and config/.
// Relative imports are resolved against the importing file, so the rule is an
// allow-list: a new folder, src/main.ts or any npm package is rejected too.
const SIM_ALLOWED_DIRS = ["src/sim", "src/data", "src/config"].map((dir) =>
  path.resolve(dir),
);

const simBoundary = {
  meta: {
    type: "problem",
    messages: {
      forbidden:
        "src/sim/ may import only sim/, data/ and config/, not '{{source}}'.",
    },
    schema: [],
  },
  create(context) {
    const fileDir = path.dirname(context.filename);
    function check(node) {
      const source = node.source;
      if (!source || source.type !== "Literal") return;
      const value = String(source.value);
      const target = path.resolve(fileDir, value);
      const allowed =
        value.startsWith(".") &&
        SIM_ALLOWED_DIRS.some(
          (dir) => target === dir || target.startsWith(dir + path.sep),
        );
      if (!allowed) {
        context.report({
          node: source,
          messageId: "forbidden",
          data: { source: value },
        });
      }
    }
    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
    };
  },
};

export default defineConfig(
  { ignores: ["dist", ".claude", "_bmad", "_bmad-output", ".worktree"] },
  {
    extends: [js.configs.recommended, tseslint.configs.recommended, prettier],
    files: ["**/*.{js,ts,tsx}"],
  },
  {
    files: ["src/sim/**/*.{js,ts,tsx}"],
    plugins: { layers: { rules: { "sim-boundary": simBoundary } } },
    rules: { "layers/sim-boundary": "error" },
  },
);
