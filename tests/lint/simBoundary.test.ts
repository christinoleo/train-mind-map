import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint();

async function boundaryErrors(filePath: string, source: string) {
  const [result] = await eslint.lintText(source, { filePath });
  return result.messages.filter((m) => m.ruleId === "layers/sim-boundary");
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
    'import "../../main";',
    'export { a } from "../../render/app";',
    'export * from "pixi.js";',
    'export const load = () => import("pixi.js");',
  ])("rejects %s", async (source) => {
    const errors = await boundaryErrors("src/sim/state/example.ts", source);
    expect(errors).toHaveLength(1);
  });

  it.each([
    'import { a } from "../../data/items";',
    'import { a } from "../../data/render";',
    'import { a } from "../../config/constants";',
    'import { a } from "../geometry/planar";',
    'import { a } from "./debug";',
    'export const load = () => import("../tick");',
  ])("allows %s", async (source) => {
    const errors = await boundaryErrors("src/sim/state/example.ts", source);
    expect(errors).toHaveLength(0);
  });

  it("covers JavaScript files", async () => {
    const source = 'import { Application } from "pixi.js";';
    const errors = await boundaryErrors("src/sim/state/example.js", source);
    expect(errors).toHaveLength(1);
  });

  it("does not restrict other layers", async () => {
    const source = 'import { Application } from "pixi.js";';
    const errors = await boundaryErrors("src/render/example.ts", source);
    expect(errors).toHaveLength(0);
  });
});

describe("src/sim/ determinism", () => {
  async function purityErrors(filePath: string, source: string) {
    const [result] = await eslint.lintText(source, { filePath });
    return result.messages.filter(
      (m) =>
        m.ruleId === "no-restricted-properties" ||
        m.ruleId === "no-restricted-globals",
    );
  }

  it.each([
    "export const x = Math.random();",
    "export const x = Date.now();",
    "export const x = performance.now();",
    "export const x = new Date();",
  ])("rejects %s", async (source) => {
    const errors = await purityErrors("src/sim/tick.ts", source);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("does not restrict other layers", async () => {
    const source = "export const x = performance.now();";
    const errors = await purityErrors("src/loop.ts", source);
    expect(errors).toHaveLength(0);
  });
});
