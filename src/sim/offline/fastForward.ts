import { OFFLINE_CAP_MS, TICK_MS } from "../../config/constants";
import { itemEntries, type ItemCounts } from "../../data/items";
import { CommandQueue } from "../commands/commandQueue";
import type { FactoryNode, GameState } from "../state/gameState";
import type { NodeId } from "../state/ids";
import { isProducer } from "../state/production";
import { sumStock } from "../state/stock";
import { updateStock } from "../systems/stock";
import { tick } from "../tick";
import { extrapolate } from "./extrapolate";
import {
  holdings,
  isSteady,
  meanRates,
  ratesSince,
  WINDOW_TICKS,
  type Rates,
} from "./steadyState";

/**
 * The CPU time the fast-forward may spend. The clock comes from outside, so
 * the simulation reads no time of its own (ADR-0002).
 */
export interface OfflineBudget {
  ms: number;
  now(): number;
}

/** The node that spent the most ticks stuck, and how it was stuck. */
export interface Bottleneck {
  node: NodeId;
  status: "blocked" | "starved";
}

/** What happened while the player was away (FR124). */
export interface OfflineReport {
  /** The absence the game made up for, capped at `OFFLINE_CAP_MS`. */
  elapsedMs: number;
  /** What the global stock gained, by item. */
  produced: ItemCounts;
  /** The node blocked or starved the longest, if any was. */
  bottleneck: Bottleneck | null;
}

/** How `node` was stuck this tick, if it was. Labs idle offline by design. */
function stuck(node: FactoryNode): Bottleneck["status"] | null {
  if (node.kind === "splitter" || node.kind === "merger") {
    return node.blocked ? "blocked" : null;
  }
  if (!isProducer(node) || node.kind === "lab") return null;
  const { status } = node.production;
  return status === "blocked" || status === "starved" ? status : null;
}

/** Ticks each node spent stuck, and the worst of them. */
class StuckTally {
  private readonly counts = new Map<
    NodeId,
    Record<Bottleneck["status"], number>
  >();

  record(state: Readonly<GameState>): void {
    for (const node of state.nodes.values()) {
      const status = stuck(node);
      if (status === null) continue;
      let count = this.counts.get(node.id);
      if (!count)
        this.counts.set(node.id, (count = { blocked: 0, starved: 0 }));
      count[status]++;
    }
  }

  /** The node stuck the most ticks; ties go to the lower id. */
  worst(): Bottleneck | null {
    let best: Bottleneck | null = null;
    let most = 0;
    for (const [node, { blocked, starved }] of this.counts) {
      const total = blocked + starved;
      if (total > most || (total === most && best && node < best.node)) {
        most = total;
        best = { node, status: blocked >= starved ? "blocked" : "starved" };
      }
    }
    return best;
  }
}

/**
 * Makes up for `awayMs` of absence (ADR-0003, FR120–FR122). The same tick
 * runs offline, where Labs do not consume, until the production rates of
 * two consecutive windows agree; the rates of those two windows then apply
 * to the rest of the time, truncated by storage. If `budget` runs out
 * first, the last complete window's rates apply instead. Changes `state` in
 * place, so whatever holds it sees the result.
 */
export function fastForward(
  state: GameState,
  awayMs: number,
  budget: OfflineBudget,
): OfflineReport {
  const elapsedMs = Math.min(Math.max(awayMs, 0), OFFLINE_CAP_MS);
  const total = Math.floor(elapsedMs / TICK_MS);
  const stockBefore = sumStock(state.nodes);
  const tally = new StuckTally();
  // Nothing is queued offline; the live queue keeps what the player queued.
  const idle = new CommandQueue();
  const deadline = budget.now() + budget.ms;

  let ran = 0;
  let windowStart = holdings(state);
  let windowTicks = 0;
  let last: Rates | null = null;
  let steady: Rates | null = null;
  while (ran < total) {
    tick(state, idle, () => {}, undefined, true);
    tally.record(state);
    ran++;
    if (++windowTicks === WINDOW_TICKS) {
      const rates = ratesSince(state, windowStart, windowTicks);
      if (last && isSteady(state, last, rates)) {
        steady = meanRates(last, rates);
        break;
      }
      last = rates;
      windowStart = holdings(state);
      windowTicks = 0;
    }
    // Reading the clock every tick would cost more than a small tick.
    if (ran % 64 === 0 && budget.now() >= deadline) break;
  }

  const rest = total - ran;
  if (rest > 0) {
    // With no complete window yet, the part measured is all there is.
    const rates =
      steady ??
      last ??
      ratesSince(state, windowStart, Math.max(windowTicks, 1));
    extrapolate(state, rates, rest);
    state.tick += rest;
  }
  updateStock(state);

  const produced: ItemCounts = {};
  for (const [item, count] of itemEntries(state.stock)) {
    const gain = count - (stockBefore[item] ?? 0);
    if (gain > 0) produced[item] = gain;
  }
  return { elapsedMs, produced, bottleneck: tally.worst() };
}
