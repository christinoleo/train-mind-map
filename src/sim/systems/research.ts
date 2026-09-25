import { LAB, RESEARCH, type ResearchId } from "../../data/research";
import type { Emit } from "../events";
import type { GameState, LabNode, NodeStatus } from "../state/gameState";
import { secondsToTicks, setStatus, work } from "../state/production";
import { creditPack, packsLeft } from "../state/research";
import type { System } from "../tick";

/** Ticks a Lab works on one pack at full power. */
export const LAB_TICKS = secondsToTicks(LAB.seconds);

/** Packs under way in the Labs for research `id`. */
function inFlight(state: Readonly<GameState>, id: ResearchId): number {
  let count = 0;
  for (const node of state.nodes.values()) {
    if (node.kind === "lab" && node.research === id) count++;
  }
  return count;
}

/**
 * Works one tick on `lab` at `satisfaction` of full speed (FR64). A pack
 * starts once the Lab holds one of the active research's type and the packs
 * already under way for it still leave it short; so no Lab spends a pack the
 * research does not need. A pack counts towards the research it was taken
 * for when its 5 s are done, even if the player has switched since.
 */
function advance(
  state: GameState,
  lab: LabNode,
  satisfaction: number,
  emit: Emit,
): NodeStatus {
  const p = lab.production;
  if (lab.research === null) {
    const active = state.research.active;
    if (active === null) return "starved";
    const { pack } = RESEARCH[active];
    const have = p.input[pack] ?? 0;
    if (have === 0 || inFlight(state, active) >= packsLeft(state, active)) {
      return "starved";
    }
    p.input[pack] = have - 1;
    p.progress = 0;
    lab.research = active;
  }
  const worked = work(p, LAB_TICKS, satisfaction);
  if (worked !== "done") return worked;
  const id = lab.research;
  p.progress = null;
  lab.research = null;
  creditPack(state, id, emit);
  return "working";
}

/**
 * Labs consume science packs for the active research, 1 pack every 5 s each
 * (FR40, FR109), and complete it once it has all it costs (FR116).
 */
export const research: System = (state, { emit }) => {
  for (const node of state.nodes.values()) {
    if (node.kind !== "lab") continue;
    const sat = state.power.satisfaction;
    setStatus(node, advance(state, node, sat, emit), emit);
  }
};

/**
 * `research` offline (FR122): Labs idle, with a pack under way held where
 * it is, and the packs pile up in their buffers and edges.
 */
export const idleLabs: System = (state, { emit }) => {
  for (const node of state.nodes.values()) {
    if (node.kind === "lab") setStatus(node, "starved", emit);
  }
};
