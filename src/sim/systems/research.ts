import { LAB, RESEARCH } from "../../data/research";
import type { Emit } from "../events";
import type { GameState, LabNode, NodeStatus } from "../state/gameState";
import { satisfactionOf } from "../state/power";
import { secondsToTicks, setStatus, work } from "../state/production";
import { creditPack, packsLeft } from "../state/research";
import type { System } from "../tick";

/** Ticks a Lab works on one pack at full power. */
export const LAB_TICKS = secondsToTicks(LAB.seconds);

/**
 * Works one tick on `lab` at `satisfaction` of full speed (FR64). A pack
 * starts once the Lab holds one of the active research's type and the
 * `inFlight` packs already under way in the Labs still leave the research
 * short; so no Lab spends a pack the research does not need. A pack counts
 * towards the research when its 5 s are done. With no research chosen, a Lab
 * idles and keeps any pack it started.
 */
function advance(
  state: GameState,
  lab: LabNode,
  satisfaction: number,
  inFlight: number,
  emit: Emit,
): NodeStatus {
  const active = state.research.active;
  if (active === null) return "starved";
  const p = lab.production;
  if (p.progress === null) {
    const { pack } = RESEARCH[active];
    const have = p.input[pack] ?? 0;
    if (have === 0 || inFlight >= packsLeft(state, active)) {
      return "starved";
    }
    p.input[pack] = have - 1;
    p.progress = 0;
  }
  const worked = work(p, LAB_TICKS, satisfaction);
  if (worked !== "done") return worked;
  p.progress = null;
  creditPack(state, emit);
  return "working";
}

/**
 * Labs consume science packs for the active research, 1 pack every 5 s each
 * (FR40, FR109), and complete it once it has all it costs (FR116).
 */
export const research: System = (state, { emit }) => {
  let inFlight = 0;
  for (const node of state.nodes.values()) {
    if (node.kind === "lab" && node.production.progress !== null) inFlight++;
  }
  for (const node of state.nodes.values()) {
    if (node.kind !== "lab") continue;
    const wasBusy = node.production.progress !== null;
    const sat = satisfactionOf(state, node.id);
    setStatus(node, advance(state, node, sat, inFlight, emit), emit);
    inFlight += Number(node.production.progress !== null) - Number(wasBusy);
  }
};
