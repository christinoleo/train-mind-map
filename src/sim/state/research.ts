import {
  RESEARCH,
  type ResearchEffect,
  type ResearchId,
} from "../../data/research";
import type { Emit } from "../events";
import type { GameState } from "./gameState";
import { isUnlocked } from "./nodes";

/** What the player has researched and is researching (FR109). */
export interface ResearchState {
  /** The research the Labs work on, or `null` while none is chosen. */
  active: ResearchId | null;
  /** Packs consumed so far, by research; a switch keeps what was spent. */
  progress: Partial<Record<ResearchId, number>>;
  /** The completed researches, in order of completion. */
  done: ResearchId[];
}

export function newResearch(): ResearchState {
  return { active: null, progress: {}, done: [] };
}

/**
 * Where a research stands: completed, the one under way, open to choose,
 * or waiting on the researches it requires.
 */
export type ResearchStatus = "done" | "active" | "available" | "locked";

export function researchStatus(
  state: Readonly<GameState>,
  id: ResearchId,
): ResearchStatus {
  const { research } = state;
  if (research.done.includes(id)) return "done";
  if (research.active === id) return "active";
  return RESEARCH[id].requires.every((r) => research.done.includes(r))
    ? "available"
    : "locked";
}

/** Packs still needed to complete `id`. */
export function packsLeft(state: Readonly<GameState>, id: ResearchId): number {
  return RESEARCH[id].cost - (state.research.progress[id] ?? 0);
}

function applyEffect(state: GameState, effect: ResearchEffect): void {
  switch (effect.type) {
    case "nodes":
      for (const kind of effect.kinds) {
        if (!isUnlocked(state, kind)) state.unlockedNodes.push(kind);
      }
      break;
    case "tap":
      state.tapLevel = Math.max(state.tapLevel, effect.level);
      break;
    case "edge":
      if (effect.level > state.edgeLevel) state.edgeLevel = effect.level;
      break;
    case "box-capacity":
      state.storageCapacity.box = Math.max(
        state.storageCapacity.box,
        effect.capacity,
      );
      break;
  }
}

/**
 * Credits one consumed pack to the active research. When that completes it,
 * its content unlocks at once and `ResearchDone` is emitted (FR116); the
 * Labs then idle until the player chooses the next one.
 */
export function creditPack(state: GameState, emit: Emit): void {
  const { research } = state;
  const id = research.active;
  if (id === null) return;
  research.progress[id] = (research.progress[id] ?? 0) + 1;
  if (packsLeft(state, id) > 0) return;
  research.done.push(id);
  research.active = null;
  for (const effect of RESEARCH[id].effects) applyEffect(state, effect);
  emit({ type: "ResearchDone", research: id });
}
