import type { FailReason } from "../sim/result";
import { strings } from "./strings";

const STEPS = [
  { size: 1_000_000, suffix: "M" },
  { size: 1_000, suffix: "K" },
] as const;

/**
 * A count in K/M notation for the HUD, in pt-BR: 950, 1,2K, 12K, 3,4M. It
 * rounds down, so the HUD never shows more than there is.
 */
export function formatCount(n: number): string {
  for (const { size, suffix } of STEPS) {
    if (n < size) continue;
    const scaled = n / size;
    // One decimal below 10 (1,2K), none from there on (12K).
    const shown =
      scaled < 10 ? Math.floor(scaled * 10) / 10 : Math.floor(scaled);
    return `${String(shown).replace(".", ",")}${suffix}`;
  }
  return String(n);
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
