import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint();

async function restrictedImports(filePath: string, source: string) {
  const [result] = await eslint.lintText(source, { filePath });
  return result.messages.filter((m) => m.ruleId === "no-restricted-imports");
}

describe("src/sim/ layer boundary", () => {
  it.each([
    'import { Application } from "pixi.js";',
    'import { h } from "preact";',
    'import { signal } from "@preact/signals";',
    'import { get } from "idb-keyval";',
    'import { a } from "../../render/app";',
    'import { a } from "../../ui/hud";',
    'import { a } from "../../input/camera";',
    'import { a } from "../../audio/engine";',
    'import { a } from "../../platform/log";',
    'import { a } from "../../debug/superadmin";',
  ])("rejects %s", async (source) => {
    const errors = await restrictedImports("src/sim/state/example.ts", source);
    expect(errors).toHaveLength(1);
  });

  it.each([
    'import { a } from "../../data/items";',
    'import { a } from "../../config/constants";',
    'import { a } from "../geometry/planar";',
  ])("allows %s", async (source) => {
    const errors = await restrictedImports("src/sim/state/example.ts", source);
    expect(errors).toHaveLength(0);
  });

  it("does not restrict other layers", async () => {
    const source = 'import { Application } from "pixi.js";';
    const errors = await restrictedImports("src/render/example.ts", source);
    expect(errors).toHaveLength(0);
  });
});
