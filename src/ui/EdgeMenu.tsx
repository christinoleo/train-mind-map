import type { ReadonlySignal } from "@preact/signals";
import { EDGE_LEVELS, type EdgeLevel } from "../data/edges";
import type { Cost } from "../data/nodes";
import { UpgradeEdge } from "../sim/commands/upgradeEdge";
import { pathLength } from "../sim/geometry/route";
import type { FailReason } from "../sim/result";
import { edgeCost, upgradeCost } from "../sim/state/edges";
import type { GameState } from "../sim/state/gameState";
import type { EdgeId } from "../sim/state/ids";
import { Menu, RemoveAction, UpgradeAction } from "./Menu";
import { strings } from "./strings";

/** What the edge menu shows of the selected edge, published by the UI bridge. */
export interface EdgeMenuInfo {
  level: EdgeLevel;
  length: number;
  /** What removing the edge gives back. */
  refund: Cost;
  /** The next level, what it costs and why it is refused; `null` at the top. */
  upgrade: { level: EdgeLevel; cost: Cost; refused: FailReason | null } | null;
}

/** What the menu shows of edge `id`, or `null` when there is no such edge. */
export function edgeMenuInfo(
  state: Readonly<GameState>,
  id: EdgeId,
): EdgeMenuInfo | null {
  const edge = state.edges.get(id);
  if (!edge) return null;
  const length = pathLength(edge.path);
  const next = EDGE_LEVELS.find((level) => level > edge.level);
  let upgrade: EdgeMenuInfo["upgrade"] = null;
  if (next) {
    const check = new UpgradeEdge(id, next).validate(state);
    upgrade = {
      level: next,
      cost: upgradeCost(length, edge.level, next),
      refused: check.ok ? null : check.reason,
    };
  }
  return {
    level: edge.level,
    length,
    refund: edgeCost(length, edge.level),
    upgrade,
  };
}

interface Props {
  edge: ReadonlySignal<EdgeMenuInfo | null>;
  onUpgrade(): void;
  onRemove(): void;
  onClose(): void;
}

/**
 * The edge menu, opened by tapping an edge (FR58, FR59): its level and
 * length, an upgrade to the next level, which pays the difference and which
 * research gates, and removal, which refunds the whole cost.
 */
export function EdgeMenu({ edge, onUpgrade, onRemove, onClose }: Props) {
  const info = edge.value;
  if (!info) return null;
  const text = strings.edge;
  const { upgrade } = info;
  return (
    <Menu
      label={text.title}
      title={
        <>
          {text.title}
          {strings.menu.separator}
          {text.level} {info.level}
          {strings.menu.separator}
          {info.length} {text.length}
        </>
      }
      onClose={onClose}
    >
      {upgrade ? (
        <UpgradeAction
          label={`${text.upgrade} ${upgrade.level}`}
          cost={upgrade.cost}
          refused={upgrade.refused}
          onClick={onUpgrade}
        />
      ) : (
        <p class="menu-note">{strings.menu.maxLevel}</p>
      )}
      <RemoveAction refund={info.refund} onClick={onRemove} />
    </Menu>
  );
}
