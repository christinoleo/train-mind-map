import { LAB, RESEARCH } from "../../data/research";
import type { Emit } from "../events";
import type { GameState, LabNode, NodeStatus } from "../state/gameState";
import { satisfactionOf } from "../state/power";
import { secondsToTicks } from "../state/production";
import { creditPack, packsLeft } from "../state/research";
import type { System } from "../tick";

/** Ticks a Lab works on one pack at full power. */
export const LAB_TICKS = secondsToTicks(LAB.seconds);

/** How far below a pack's ticks progress may fall and still count as done. */
const PROGRESS_EPSILON = 1e-9;

/**
 * Works one tick on `lab` at `satisfaction` of full speed (FR64). A pack
 * starts once the Lab holds one of the active research's type and the packs
 * already under way in the Labs, `inFlight`, still leave the research short;
 * so no Lab spends a pack the research does not need. A pack counts towards
 * the research when its 5 s are done. With no research chosen, a Lab idles
 * and keeps any pack it started.
 */
function advance(
  state: GameState,
  lab: LabNode,
  satisfaction: number,
  inFlight: { count: number },
  emit: Emit,
): NodeStatus {
  const active = state.research.active;
  if (active === null) return "starved";
  const p = lab.production;
  if (p.progress === null) {
    const { pack } = RESEARCH[active];
    const have = p.input[pack] ?? 0;
    if (have === 0 || inFlight.count >= packsLeft(state, active)) {
      return "starved";
    }
    p.input[pack] = have - 1;
    p.progress = 0;
    inFlight.count++;
  }
  if (p.progress < LAB_TICKS - PROGRESS_EPSILON) {
    if (satisfaction === 0) return "no_power";
    p.progress += satisfaction;
    if (p.progress < LAB_TICKS - PROGRESS_EPSILON) return "working";
  }
  p.progress = null;
  inFlight.count--;
  creditPack(state, emit);
  return "working";
}

/**
 * Labs consume science packs for the active research, 1 pack every 5 s each
 * (FR40, FR109), and complete it once it has all it costs (FR116).
 */
export const research: System = (state, { emit }) => {
  const labs: LabNode[] = [];
  for (const node of state.nodes.values()) {
    if (node.kind === "lab") labs.push(node);
  }
  const inFlight = {
    count: labs.filter((lab) => lab.production.progress !== null).length,
  };
  for (const lab of labs) {
    const p = lab.production;
    const status = advance(
      state,
      lab,
      satisfactionOf(state, lab.id),
      inFlight,
      emit,
    );
    if (status === p.status) continue;
    p.status = status;
    emit({ type: "NodeStatusChanged", node: lab.id, status });
  }
};
