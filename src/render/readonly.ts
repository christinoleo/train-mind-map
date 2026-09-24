/**
 * A read-only view of simulation data. Rendering takes the state through this
 * type so the compiler rejects any write (architecture §Padrão 3).
 */
export type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends Map<infer K, infer V>
    ? ReadonlyMap<K, DeepReadonly<V>>
    : T extends object
      ? { readonly [P in keyof T]: DeepReadonly<T[P]> }
      : T;
