// Expected failures (an edge would cross, no stock, an occupied cell) are
// returned, never thrown: commands validate into a Result and the UI turns the
// reason into feedback. Bugs throw and reach the global error handler.

export type FailReason =
  | "crosses_edge"
  | "no_stock"
  | "occupied"
  | "not_found"
  | "nothing_to_undo"
  | "out_of_range";

export type Result<T = void> =
  { ok: true; value: T } | { ok: false; reason: FailReason };

export function ok(): Result<void>;
export function ok<T>(value: T): Result<T>;
export function ok<T>(value?: T): Result<T | undefined> {
  return { ok: true, value };
}

export function fail<T = never>(reason: FailReason): Result<T> {
  return { ok: false, reason };
}
