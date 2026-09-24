declare const brand: unique symbol;

/** A number that the type system keeps apart from other ids. */
type Brand<B extends string> = number & { readonly [brand]: B };

export type NodeId = Brand<"NodeId">;
export type EdgeId = Brand<"EdgeId">;

interface IdKinds {
  node: NodeId;
  edge: EdgeId;
}

/** The next free id of each kind. Ids are never reused. */
export type NextIds = { [K in keyof IdKinds]: number };

export function initialNextIds(): NextIds {
  return { node: 1, edge: 1 };
}

export function allocateId<K extends keyof IdKinds>(
  nextIds: NextIds,
  kind: K,
): IdKinds[K] {
  return nextIds[kind]++ as IdKinds[K];
}
