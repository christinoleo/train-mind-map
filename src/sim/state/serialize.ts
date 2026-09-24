import type { GameState } from "./gameState";

type Pairs<T> = T extends Map<infer K, infer V> ? [K, V][] : T;

/** GameState with every Map stored as an array of pairs, so it survives JSON. */
export type SerializedState = { [K in keyof GameState]: Pairs<GameState[K]> };

/** The state with Maps as pairs, still sharing its data with `state`. */
function toPairs(state: GameState): SerializedState {
  return { ...state, nodes: [...state.nodes], edges: [...state.edges] };
}

export function serializeState(state: GameState): SerializedState {
  return structuredClone(toPairs(state));
}

export function deserializeState(data: SerializedState): GameState {
  const copy = structuredClone(data);
  return {
    ...copy,
    nodes: new Map(copy.nodes),
    edges: new Map(copy.edges),
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
