// Guards simulation invariants in dev and production alike. A broken invariant
// is a bug, so it throws and the global error handler takes over; expected
// failures return a Result instead.
export function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}
