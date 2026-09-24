import type { Rect } from "./rect";

/** Room for bucket columns in a key; far beyond any map. */
const KEY_STRIDE = 1 << 16;

/** The key of the bucket in column `bx`, row `by`. */
function key(bx: number, by: number): number {
  return by * KEY_STRIDE + bx;
}

/**
 * A uniform grid of square buckets over cell space. Each item is filed under
 * every bucket its bounds touch, so a query looks only at the buckets a
 * candidate touches. Iteration follows insertion order, so results are
 * deterministic.
 */
export class SpatialHash<T> {
  private readonly buckets = new Map<number, Set<T>>();
  private readonly keysOf = new Map<T, number[]>();

  constructor(readonly bucketCells: number) {}

  /** Files `item` under the buckets `bounds` touches. */
  insert(item: T, bounds: Rect): number[] {
    if (this.keysOf.has(item)) throw new Error("item is already in the hash");
    const keys = this.keys(bounds);
    for (const key of keys) {
      let bucket = this.buckets.get(key);
      if (!bucket) this.buckets.set(key, (bucket = new Set()));
      bucket.add(item);
    }
    this.keysOf.set(item, keys);
    return keys;
  }

  /** Drops `item` and returns the keys of the buckets it was in. */
  remove(item: T): number[] {
    const keys = this.keysOf.get(item);
    if (!keys) throw new Error("item is not in the hash");
    for (const key of keys) {
      const bucket = this.buckets.get(key)!;
      bucket.delete(item);
      if (bucket.size === 0) this.buckets.delete(key);
    }
    this.keysOf.delete(item);
    return keys;
  }

  /** Every item filed in a bucket that `bounds` touches, each once. */
  query(bounds: Rect): T[] {
    const found = new Set<T>();
    for (const key of this.keys(bounds)) {
      const bucket = this.buckets.get(key);
      if (bucket) for (const item of bucket) found.add(item);
    }
    return [...found];
  }

  /** The items filed under bucket `key`. */
  bucket(key: number): ReadonlySet<T> | undefined {
    return this.buckets.get(key);
  }

  /** The key of the bucket holding cell (x, y). */
  keyAt(x: number, y: number): number {
    return key(
      Math.floor(x / this.bucketCells),
      Math.floor(y / this.bucketCells),
    );
  }

  /** The cells bucket `key` covers. */
  bucketRect(key: number): Rect {
    const size = this.bucketCells;
    return {
      x: (key % KEY_STRIDE) * size,
      y: Math.floor(key / KEY_STRIDE) * size,
      w: size,
      h: size,
    };
  }

  /** Every non-empty bucket with its item count, for the debug overlay. */
  *occupied(): Generator<{ rect: Rect; count: number }> {
    for (const [key, bucket] of this.buckets) {
      yield { rect: this.bucketRect(key), count: bucket.size };
    }
  }

  private keys(bounds: Rect): number[] {
    const size = this.bucketCells;
    const x0 = Math.floor(bounds.x / size);
    const y0 = Math.floor(bounds.y / size);
    const x1 = Math.floor((bounds.x + bounds.w - 1) / size);
    const y1 = Math.floor((bounds.y + bounds.h - 1) / size);
    const keys: number[] = [];
    for (let by = y0; by <= y1; by++) {
      for (let bx = x0; bx <= x1; bx++) keys.push(key(bx, by));
    }
    return keys;
  }
}
