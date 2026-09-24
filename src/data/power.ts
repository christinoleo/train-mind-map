import type { RawResource } from "./items";
import type { NodeKind } from "./nodes";

/** The ⚡ the Core gives its mesh for free, from the start (FR28, FR67). */
export const CORE_POWER = 3;

/**
 * The Generator burns one `fuel` item every `seconds` and gives its mesh
 * `power` ⚡ while it burns (FR32). Its buffer holds `buffer` fuel items.
 */
export const GENERATOR: Readonly<{
  fuel: RawResource;
  seconds: number;
  power: number;
  buffer: number;
}> = { fuel: "coal", seconds: 4, power: 10, buffer: 2 };

/**
 * The ⚡ a node draws while it operates (FR63). Kinds left out, the logistics
 * and storage nodes, draw nothing.
 */
export const POWER_DEMAND: Readonly<Partial<Record<NodeKind, number>>> = {
  extractor: 1,
  furnace: 2,
  "assembler-1": 2,
  "assembler-2": 3,
  lab: 2,
};
