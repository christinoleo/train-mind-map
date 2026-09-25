import type { ReadonlySignal } from "@preact/signals";
import { EDGE_LEVELS, type EdgeLevel } from "../data/edges";
import type { Cost } from "../data/nodes";
import { UpgradeEdge } from "../sim/commands/upgradeEdge";
import { pathLength } from "../sim/geometry/route";
import type { FailReason } from "../sim/result";
import { edgeCost, edgeThroughput, upgradeCost } from "../sim/state/edges";
import type { GameState } from "../sim/state/gameState";
import type { EdgeId } from "../sim/state/ids";
import { ActionBubble, BubbleAction } from "./ActionBubble";
import type { ScreenRect } from "./bubblePlacement";
import { formatPerSecond, shortCostText } from "./format";
import { strings } from "./strings";

/** What the edge's action bubble shows of the selected edge, published by the UI bridge. */
export interface EdgeMenuInfo {
  level: EdgeLevel;
  length: number;
  /** The items/s it carries. */
  throughput: number;
  /** What removing the edge gives back. */
  refund: Cost;
  /**
   * The next level, what it costs, the items/s it would carry and why it is
   * refused; `null` at the top.
   */
  upgrade: {
    level: EdgeLevel;
    cost: Cost;
    throughput: number;
    refused: FailReason | null;
  } | null;
}

/** What the bubble shows of edge `id`, or `null` when there is no such edge. */
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
      throughput: edgeThroughput(length, next),
      refused: check.ok ? null : check.reason,
    };
  }
  return {
    level: edge.level,
    length,
    throughput: edgeThroughput(length, edge.level),
    refund: edgeCost(length, edge.level),
    upgrade,
  };
}

interface Props {
  edge: ReadonlySignal<EdgeMenuInfo | null>;
  /** Where the edge was tapped, on the screen. */
  anchor: ReadonlySignal<ScreenRect | null>;
  onUpgrade(): void;
  onRemove(): void;
  onClose(): void;
}

/**
 * The edge's action bubble, opened by tapping an edge (FR58, FR59) and
 * pointing at the tap: its level, length and items/s, an upgrade to the
 * next level, which pays the difference and which research gates, and
 * removal, which refunds the whole cost and can be undone from its toast.
 */
export function EdgeMenu({
  edge,
  anchor,
  onUpgrade,
  onRemove,
  onClose,
}: Props) {
  const info = edge.value;
  if (!info) return null;
  const text = strings.edge;
  const glyphs = strings.bubble;
  const { upgrade } = info;
  const { separator } = strings.menu;
  return (
    <ActionBubble label={text.title} anchor={anchor} onClose={onClose}>
      <p class="bubble-title">
        {text.title}
        {separator}
        {text.level} {info.level}
        {separator}
        {info.length} {text.length}
        {separator}
        {formatPerSecond(info.throughput)}
      </p>
      <div class="bubble-actions">
        {upgrade && (
          <BubbleAction
            glyph={glyphs.upgradeGlyph}
            label={`${text.level} ${upgrade.level}`}
            detail={`${shortCostText(upgrade.cost)}${separator}${formatPerSecond(upgrade.throughput)}`}
            refused={upgrade.refused}
            onClick={onUpgrade}
          />
        )}
        <BubbleAction
          glyph={glyphs.removeGlyph}
          label={strings.menu.remove}
          detail={`${strings.menu.refund} ${shortCostText(info.refund)}`}
          danger
          onClick={onRemove}
        />
      </div>
    </ActionBubble>
  );
}
