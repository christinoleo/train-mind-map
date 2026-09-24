import type { GameState } from "./gameState";
import { newPower } from "./power";
import { reservationsOf } from "../rail/reservation";
import { sumStock } from "./stock";

type Pairs<T> = T extends Map<infer K, infer V> ? [K, V][] : T;

/** The state that is saved: all of it but the derived caches. */
type SavedState = Omit<GameState, "stock" | "power" | "reservations">;

/** GameState with every Map stored as an array of pairs, so it survives JSON. */
export type SerializedState = { [K in keyof SavedState]: Pairs<SavedState[K]> };

/** The saved state with Maps as pairs, still sharing its data with `state`. */
export function toPairs(state: GameState): SerializedState {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { stock, power, reservations, ...saved } = state;
  return {
    ...saved,
    nodes: [...state.nodes],
    edges: [...state.edges],
    rails: [...state.rails],
    trains: [...state.trains],
  };
}

export function serializeState(state: GameState): SerializedState {
  return structuredClone(toPairs(state));
}

export function deserializeState(data: SerializedState): GameState {
  const copy = structuredClone(data);
  const nodes = new Map(copy.nodes);
  const trains = new Map(copy.trains);
  return {
    ...copy,
    nodes,
    edges: new Map(copy.edges),
    rails: new Map(copy.rails),
    trains,
    reservations: reservationsOf(trains),
    stock: sumStock(nodes),
    power: newPower(),
  };
}

/** A 53-bit hash (cyrb53) of the serialized state, as hex. */
export function hashState(state: GameState): string {
  const text = JSON.stringify(toPairs(state));
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
