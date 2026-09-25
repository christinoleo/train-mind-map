/** The raw resources that deposits hold (GDD §Mapa e recursos). */
export const RAW_RESOURCES = [
  "iron-ore",
  "copper-ore",
  "coal",
  "stone",
  "crude-oil",
] as const;

export type RawResource = (typeof RAW_RESOURCES)[number];

/**
 * Every item the game knows so far: the raw resources plus the products of
 * the red-era recipes (FR49). Later eras add the rest of the 31 items.
 */
export const ITEMS = [
  ...RAW_RESOURCES,
  "iron-plate",
  "copper-plate",
  "brick",
  "gear",
  "copper-cable",
  "circuit",
  "rail",
  "red-science",
] as const;

export type ItemId = (typeof ITEMS)[number];

/** The item categories, in the order the inventory lists them. */
export const ITEM_CATEGORIES = [
  "raw",
  "smelted",
  "intermediate",
  "science",
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

/** Each item's category, which orders the inventory's slots (FR68). */
export const ITEM_CATEGORY: Record<ItemId, ItemCategory> = {
  "iron-ore": "raw",
  "copper-ore": "raw",
  coal: "raw",
  stone: "raw",
  "crude-oil": "raw",
  "iron-plate": "smelted",
  "copper-plate": "smelted",
  brick: "smelted",
  gear: "intermediate",
  "copper-cable": "intermediate",
  circuit: "intermediate",
  rail: "intermediate",
  "red-science": "science",
};

/** A count per item type; absent types count zero. */
export type ItemCounts = Partial<Record<ItemId, number>>;

/** The item types `counts` names, with their counts. */
export function itemEntries(counts: Readonly<ItemCounts>): [ItemId, number][] {
  return Object.entries(counts) as [ItemId, number][];
}

/** Adds `counts` into `into`, item by item, and returns `into`. */
export function addCounts(
  into: ItemCounts,
  counts: Readonly<ItemCounts>,
): ItemCounts {
  for (const [item, count] of itemEntries(counts)) {
    into[item] = (into[item] ?? 0) + count;
  }
  return into;
}

/**
 * What `to` counts beyond `from`, item by item: the difference paid to raise
 * something that cost `from` to something that costs `to`. Items `to` needs
 * fewer of cost nothing.
 */
export function countsAbove(
  from: Readonly<ItemCounts>,
  to: Readonly<ItemCounts>,
): ItemCounts {
  const diff: ItemCounts = {};
  for (const [item, count] of itemEntries(to)) {
    const more = count - (from[item] ?? 0);
    if (more > 0) diff[item] = more;
  }
  return diff;
}
