import { itemEntries, type ItemCounts, type ItemId } from "../data/items";
import type { FailReason } from "../sim/result";
import { strings } from "./strings";

/** The suffixes of the first tiers of 1000: 1,2K, 3,4M, 5B, 67T. */
const SUFFIXES = ["", "K", "M", "B", "T"];
const LETTERS = "abcdefghijklmnopqrstuvwxyz";

/** The suffix of tier `tier` of 1000: K, M, B, T, then aa, ab, …, zz. */
function suffix(tier: number): string {
  if (tier < SUFFIXES.length) return SUFFIXES[tier];
  const i = tier - SUFFIXES.length;
  return LETTERS[Math.floor(i / 26) % 26] + LETTERS[i % 26];
}

/**
 * An amount in idle-game notation, in pt-BR, for every count the player
 * reads: 950, 1,2K, 12K, 3,4M, 5B, 67T, then 1aa, 1ab and on. It keeps two
 * or three significant digits and rounds down, so it never shows more than
 * there is. The Core's unlimited capacity reads "∞".
 */
export function formatAmount(n: number): string {
  if (n === Infinity) return "∞";
  if (n < 1000) return String(n);
  let tier = 0;
  while (1000 ** (tier + 1) <= n) tier++;
  const scaled = n / 1000 ** tier;
  // One decimal below 10 (1,2K), none from there on (12K).
  const shown = scaled < 10 ? Math.floor(scaled * 10) / 10 : Math.floor(scaled);
  return `${String(shown).replace(".", ",")}${suffix(tier)}`;
}

/** A rate or fraction to two significant digits, in pt-BR: 0,25, 1,5, 12. */
export function formatRate(n: number): string {
  return String(Number(n.toPrecision(2))).replace(".", ",");
}

/** Items gained, for the labels that fly from a tap to the Core: "+1 pedra". */
export function formatGain(count: number, item: ItemId): string {
  return `+${count} ${strings.items[item]}`;
}

/** A duration for the offline report, rounded down: 8 h, 2 h 15 min, 45 min, 30 s. */
export function formatDuration(ms: number): string {
  const { hours: h, minutes: min, seconds: s } = strings.offline;
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours > 0)
    return rest > 0 ? `${hours} ${h} ${rest} ${min}` : `${hours} ${h}`;
  if (minutes > 0) return `${minutes} ${min}`;
  return `${Math.floor(ms / 1000)} ${s}`;
}

/**
 * What a dragged edge comes to, for its chip: its length, its cost and the
 * items/s it carries ("42 células · 132 min. ferro · 0,25/s").
 */
export function edgeStatsText(
  length: number,
  cost: Readonly<ItemCounts>,
  throughput: number,
): string {
  const price = itemEntries(cost)
    .map(([item, n]) => `${formatAmount(n)} ${strings.itemsShort[item]}`)
    .join(", ");
  return [
    `${length} ${strings.edge.length}`,
    price,
    `${formatRate(throughput)}${strings.edge.perSecond}`,
  ].join(strings.menu.separator);
}

/**
 * Why a dragged edge cannot be built, for its chip: the reason, or, for an
 * edge over the length limit, its length against the limit ("Longa demais
 * 14/12"). Water gets its own wording: the shared reason speaks of nodes.
 */
export function edgeReasonText(
  reason: FailReason,
  length: number | null,
  max: number,
): string {
  if (reason === "out_of_range" && length !== null) {
    return `${strings.edge.tooLong} ${length}/${max}`;
  }
  if (reason === "on_water") return strings.edge.onWater;
  return strings.reasons[reason];
}
