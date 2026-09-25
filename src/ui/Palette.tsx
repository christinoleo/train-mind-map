import type { ReadonlySignal, Signal } from "@preact/signals";
import { useState } from "preact/hooks";
import { itemEntries } from "../data/items";
import { NODES, type NodeKind } from "../data/nodes";
import { CATEGORY_COLOR, cssColor } from "../render/theme";
import type { FailReason } from "../sim/result";
import { formatAmount } from "./format";
import { strings } from "./strings";

interface Props {
  /** The kinds the player may build, in palette order. */
  unlocked: ReadonlySignal<readonly NodeKind[]>;
  /** The kind being placed, or `null`. */
  selected: Signal<NodeKind | null>;
  /** Why the ghost cannot be placed where it is. */
  hint: ReadonlySignal<FailReason | null>;
}

/**
 * The node palette (FR16, FR132): a "+" button that opens a bottom tray of
 * the unlocked kinds, each tinted by its category and showing its cost.
 * Picking a kind starts placing it; picking it again, or closing the tray,
 * stops.
 */
export function Palette({ unlocked, selected, hint }: Props) {
  const [open, setOpen] = useState(false);
  const text = strings.palette;

  function toggle() {
    if (open) selected.value = null;
    setOpen(!open);
  }

  function pick(kind: NodeKind) {
    selected.value = selected.value === kind ? null : kind;
  }

  return (
    <div class="palette">
      <PlacementHint hint={hint} />
      <div class="palette-bar">
        {open && (
          <div class="palette-tray">
            {unlocked.value.map((kind) => (
              <button
                type="button"
                key={kind}
                class="palette-item"
                aria-pressed={selected.value === kind}
                style={{
                  "--category": cssColor(CATEGORY_COLOR[NODES[kind].category]),
                }}
                onClick={() => pick(kind)}
              >
                <span class="palette-name">{strings.nodes[kind]}</span>
                <CostList kind={kind} />
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          class="palette-toggle"
          aria-expanded={open}
          aria-label={open ? text.close : text.open}
          onClick={toggle}
        >
          {open ? "×" : "+"}
        </button>
      </div>
    </div>
  );
}

/**
 * Its own component so a hint change, which comes with every ghost move,
 * re-renders only this line and not the tray.
 */
function PlacementHint({ hint }: { hint: ReadonlySignal<FailReason | null> }) {
  if (!hint.value) return null;
  return (
    <p class="palette-hint" role="status">
      {strings.reasons[hint.value]}
    </p>
  );
}

function CostList({ kind }: { kind: NodeKind }) {
  const entries = itemEntries(NODES[kind].cost);
  return (
    <span class="palette-cost">
      {entries.length === 0
        ? strings.palette.free
        : entries.map(([item, count]) => (
            <span key={item}>
              {formatAmount(count)} {strings.items[item]}
            </span>
          ))}
    </span>
  );
}
