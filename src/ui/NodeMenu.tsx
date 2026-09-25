import { useEffect, useState } from "preact/hooks";
import type { ReadonlySignal } from "@preact/signals";
import { NODES, type Cost, type NodeKind } from "../data/nodes";
import { RECIPE_IDS, RECIPES, type RecipeId } from "../data/recipes";
import { UpgradeNode, nodeUpgradeCost } from "../sim/commands/upgradeNode";
import type { FailReason } from "../sim/result";
import type { GameState } from "../sim/state/gameState";
import type { NodeId } from "../sim/state/ids";
import { canRun } from "../sim/state/nodes";
import { isCrafter } from "../sim/state/production";
import { bufferCapacity, isBuffer, storedCount } from "../sim/state/stock";
import { formatAmount, shortCostText } from "./format";
import { ActionBubble, BubbleAction, BubbleRemove } from "./ActionBubble";
import type { ScreenRect } from "./bubblePlacement";
import { ItemIcon } from "./InventoryPanel";
import { strings } from "./strings";

/** What the node's action bubble shows of the selected node, published by the UI bridge. */
export interface NodeMenuInfo {
  id: NodeId;
  kind: NodeKind;
  /** The recipe it runs and those it may run; `null` for kinds without one. */
  recipes: { current: RecipeId | null; options: (RecipeId | null)[] } | null;
  /** The next kind, what it costs and why it is refused; `null` at the top. */
  upgrade: { kind: NodeKind; cost: Cost; refused: FailReason | null } | null;
  /** What removing it gives back; `null` for the Core, which stays. */
  refund: Cost | null;
  /**
   * How full the Core, a Box or a Station's buffer is, and a Box's "não
   * usar em construção" option (`null` on the others); `null` for kinds that
   * hold nothing.
   */
  storage: {
    stored: number;
    capacity: number;
    noConstruction: boolean | null;
  } | null;
}

/** What the bubble shows of node `id`, or `null` when there is no such node. */
export function nodeMenuInfo(
  state: Readonly<GameState>,
  id: NodeId,
): NodeMenuInfo | null {
  const node = state.nodes.get(id);
  if (!node) return null;
  const { kind } = node;
  let recipes: NodeMenuInfo["recipes"] = null;
  if (isCrafter(node)) {
    const runs = RECIPE_IDS.filter((recipe) => canRun(kind, recipe));
    // A Furnace may also pick its recipe from its first input.
    const options = kind === "furnace" ? [null, ...runs] : runs;
    recipes = { current: node.recipe, options };
  }
  const next = NODES[kind].upgrade;
  let upgrade: NodeMenuInfo["upgrade"] = null;
  if (next) {
    const check = new UpgradeNode(id).validate(state);
    upgrade = {
      kind: next,
      cost: nodeUpgradeCost(kind, next),
      refused: check.ok ? null : check.reason,
    };
  }
  return {
    id,
    kind,
    recipes,
    upgrade,
    refund: kind === "core" ? null : NODES[kind].cost,
    storage: isBuffer(node)
      ? {
          stored: storedCount(node),
          capacity: bufferCapacity(state, node),
          noConstruction: node.kind === "box" ? node.noConstruction : null,
        }
      : null,
  };
}

interface Props {
  node: ReadonlySignal<NodeMenuInfo | null>;
  /** Where the node is on the screen. */
  anchor: ReadonlySignal<ScreenRect | null>;
  onRecipe(recipe: RecipeId | null): void;
  /** Sets a Box's "não usar em construção" option. */
  onConstruction(noConstruction: boolean): void;
  onUpgrade(): void;
  onRemove(): void;
  /** Starts a Line from a Station, on the rail layer. */
  onLine(): void;
  onClose(): void;
}

/**
 * The node's action bubble, opened by tapping a node (FR19, FR22, FR27):
 * the recipe of a Furnace or Assembler, picked in the bubble itself and
 * losing the items inside when changed, an upgrade in place, which pays the
 * difference, and removal, which refunds the whole cost and can be undone
 * from its toast. The Core, a Box and a Station show how full they are, a
 * Box has its "não usar em construção" option (FR71) and a Station starts a
 * Line. A drag on the node moves it instead.
 */
export function NodeMenu({
  node,
  anchor,
  onRecipe,
  onConstruction,
  onUpgrade,
  onRemove,
  onLine,
  onClose,
}: Props) {
  /** The node whose recipe picker is open, in place of its actions. */
  const [picking, setPicking] = useState<NodeId | null>(null);
  const info = node.value;
  // A bubble closed on its picker opens on its actions next time.
  useEffect(() => {
    if (!info) setPicking(null);
  }, [info === null]);
  if (!info) return null;
  const text = strings.node;
  const glyphs = strings.bubble;
  const { recipes, upgrade, refund, storage } = info;
  const full = storage !== null && storage.stored >= storage.capacity;
  const title = (
    <p class="bubble-title">
      {strings.nodes[info.kind]}
      {storage && (
        <>
          {strings.menu.separator}
          <span data-full={full}>
            {formatAmount(storage.stored)}/{formatAmount(storage.capacity)}
            {full && ` ${text.full}`}
          </span>
        </>
      )}
    </p>
  );
  if (recipes && picking === info.id) {
    return (
      <ActionBubble label={text.recipe} anchor={anchor} onClose={onClose}>
        <div class="bubble-head">
          <button
            type="button"
            class="bubble-back"
            aria-label={glyphs.back}
            onClick={() => setPicking(null)}
          >
            {glyphs.backGlyph}
          </button>
          <span>{text.recipe}</span>
        </div>
        <div class="bubble-recipes">
          {recipes.options.map((recipe) => (
            <button
              type="button"
              key={recipe ?? "auto"}
              class="bubble-recipe"
              aria-pressed={recipe === recipes.current}
              onClick={() => {
                if (recipe !== recipes.current) onRecipe(recipe);
                setPicking(null);
              }}
            >
              {recipe ? (
                <ItemIcon item={RECIPES[recipe].output} />
              ) : (
                <span class="bubble-glyph" aria-hidden="true">
                  {glyphs.autoGlyph}
                </span>
              )}
              <span>{recipe ? strings.items[recipe] : text.autoRecipe}</span>
            </button>
          ))}
        </div>
        <p class="bubble-note">{text.recipeLoses}</p>
      </ActionBubble>
    );
  }
  return (
    <ActionBubble label={text.title} anchor={anchor} onClose={onClose}>
      {title}
      <div class="bubble-actions">
        {recipes && (
          <BubbleAction
            glyph={glyphs.recipeGlyph}
            label={text.recipe}
            detail={
              recipes.current ? strings.items[recipes.current] : text.autoRecipe
            }
            onClick={() => setPicking(info.id)}
          />
        )}
        {upgrade && (
          <BubbleAction
            glyph={glyphs.upgradeGlyph}
            label={glyphs.upgrade}
            detail={shortCostText(upgrade.cost)}
            refused={upgrade.refused}
            onClick={onUpgrade}
          />
        )}
        {storage && storage.noConstruction !== null && (
          <BubbleAction
            glyph={glyphs.keepGlyph}
            label={text.noConstruction}
            pressed={storage.noConstruction}
            onClick={() => onConstruction(!storage.noConstruction)}
          />
        )}
        {info.kind === "station" && (
          <BubbleAction
            glyph={glyphs.lineGlyph}
            label={glyphs.line}
            onClick={onLine}
          />
        )}
        {refund && <BubbleRemove refund={refund} onClick={onRemove} />}
      </div>
      {!refund && <p class="bubble-note">{strings.reasons.indestructible}</p>}
    </ActionBubble>
  );
}
