import { NEW_EDGE_LEVEL } from "../../data/edges";
import type { Emit } from "../events";
import { buildPlanarIndex } from "../geometry/planar";
import { fail, ok, type Result } from "../result";
import {
  checkConnectors,
  pathBounds,
  planRoute,
  type Connector,
  type EdgePlan,
} from "../state/edges";
import type { GameState } from "../state/gameState";
import { allocateId, type EdgeId } from "../state/ids";
import { topologyChanged } from "../state/power";
import { debit } from "../state/stock";
import type { Command } from "./command";
import { RemoveEdge } from "./removeEdge";

/**
 * Plans a new edge from output connector `from` to input connector `to`:
 * the connectors, then the automatic route, its length and its cost.
 */
export function planEdge(
  state: Readonly<GameState>,
  from: Connector,
  to: Connector,
  index = buildPlanarIndex(state),
): EdgePlan {
  const ends = checkConnectors(state, from, to, NEW_EDGE_LEVEL);
  if (!ends.ok) return { route: null, check: fail(ends.reason) };
  return planRoute(
    state,
    index,
    ends.value.from,
    ends.value.to,
    NEW_EDGE_LEVEL,
  );
}

/**
 * Builds an edge from an output connector to an input connector along its
 * automatic route, paid per cell from the global stock (FR44, FR51–FR54).
 * One edge fits per connector.
 */
export class ConnectEdge implements Command {
  readonly type = "ConnectEdge";
  private built?: EdgeId;

  constructor(
    readonly from: Connector,
    readonly to: Connector,
  ) {}

  validate(state: Readonly<GameState>): Result {
    const { check } = planEdge(state, this.from, this.to);
    return check.ok ? ok() : fail(check.reason);
  }

  apply(state: GameState, emit: Emit) {
    const { route, check } = planEdge(state, this.from, this.to);
    if (!route || !check.ok) {
      throw new Error("ConnectEdge applied without validating");
    }
    const id = allocateId(state.nextIds, "edge");
    const site = pathBounds(route.path);
    const draws = debit(state, check.value, site);
    state.edges.set(id, {
      id,
      from: this.from.node,
      fromPort: this.from.port,
      to: this.to.node,
      toPort: this.to.port,
      level: NEW_EDGE_LEVEL,
      path: route.path,
      items: [],
    });
    topologyChanged(state);
    this.built = id;
    emit({ type: "ConstructionPaid", site, draws });
  }

  invert(): Command {
    if (this.built === undefined)
      throw new Error("ConnectEdge was not applied");
    return new RemoveEdge(this.built);
  }
}
