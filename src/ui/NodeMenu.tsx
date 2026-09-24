import type { ReadonlySignal } from "@preact/signals";
import { NODES, type Cost, type NodeKind } from "../data/nodes";
import { RECIPE_IDS, type RecipeId } from "../data/recipes";
import { UpgradeNode, nodeUpgradeCost } from "../sim/commands/upgradeNode";
import type { FailReason } from "../sim/result";
import type { GameState } from "../sim/state/gameState";
import type { NodeId } from "../sim/state/ids";
import { canRun } from "../sim/state/nodes";
import { isCrafter } from "../sim/state/production";
import { Menu, RemoveAction, UpgradeAction } from "./Menu";
import { strings } from "./strings";

/** What the node menu shows of the selected node, published by the UI bridge. */
export interface NodeMenuInfo {
  kind: NodeKind;
  /** The recipe it runs and those it may run; `null` for kinds without one. */
  recipes: { current: RecipeId | null; options: (RecipeId | null)[] } | null;
  /** The next kind, what it costs and why it is refused; `null` at the top. */
  upgrade: { kind: NodeKind; cost: Cost; refused: FailReason | null } | null;
  /** What removing it gives back; `null` for the Core, which stays. */
  refund: Cost | null;
}

/** What the menu shows of node `id`, or `null` when there is no such node. */
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
    kind,
    recipes,
    upgrade,
    refund: kind === "core" ? null : NODES[kind].cost,
  };
}

interface Props {
  node: ReadonlySignal<NodeMenuInfo | null>;
  onRecipe(recipe: RecipeId | null): void;
  onUpgrade(): void;
  onRemove(): void;
  onClose(): void;
}

/**
 * The node menu, opened by tapping a node (FR22, FR27): the recipe of a
 * Furnace or Assembler, which loses the items inside when changed, an
 * upgrade in place, which pays the difference, and removal, which refunds
 * the whole cost. A long press on the node moves it instead.
 */
export function NodeMenu({
  node,
  onRecipe,
  onUpgrade,
  onRemove,
  onClose,
}: Props) {
  const info = node.value;
  if (!info) return null;
  const text = strings.node;
  const { recipes, upgrade, refund } = info;
  return (
    <Menu label={text.title} title={strings.nodes[info.kind]} onClose={onClose}>
      {recipes && (
        <fieldset class="menu-recipes">
          <legend>{text.recipe}</legend>
          <div class="menu-chips">
            {recipes.options.map((recipe) => (
              <button
                type="button"
                key={recipe ?? "auto"}
                class="menu-chip"
                aria-pressed={recipe === recipes.current}
                onClick={() => recipe !== recipes.current && onRecipe(recipe)}
              >
                {recipe ? strings.items[recipe] : text.autoRecipe}
              </button>
            ))}
          </div>
          <p class="menu-note">{text.recipeLoses}</p>
        </fieldset>
      )}
      {upgrade ? (
        <UpgradeAction
          label={`${text.upgrade} ${strings.nodes[upgrade.kind]}`}
          cost={upgrade.cost}
          refused={upgrade.refused}
          onClick={onUpgrade}
        />
      ) : (
        recipes && <p class="menu-note">{strings.menu.maxLevel}</p>
      )}
      {refund ? (
        <RemoveAction refund={refund} onClick={onRemove} />
      ) : (
        <p class="menu-note">{strings.reasons.indestructible}</p>
      )}
    </Menu>
  );
}
