// Expected failures (an edge would cross, no stock, an occupied cell) are
// returned, never thrown: commands validate into a Result and the UI turns the
// reason into feedback. Bugs throw and reach the global error handler.

export type FailReason =
  | "bad_replay"
  | "bad_save"
  | "connector_taken"
  | "crosses_edge"
  | "crosses_node"
  | "crosses_rail"
  | "immovable"
  | "has_rails"
  | "indestructible"
  | "locked"
  | "max_level"
  | "needs_deposit"
  | "newer_save"
  | "no_route"
  | "no_stamina"
  | "no_stock"
  | "no_target"
  | "not_found"
  | "not_tappable"
  | "nothing_to_undo"
  | "occupied"
  | "on_deposit"
  | "on_water"
  | "out_of_bounds"
  | "out_of_range"
  | "researched"
  | "same_node"
  | "storage_full"
  | "wrong_recipe";

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
