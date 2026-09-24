import { describe, expect, it } from "vitest";

// itch.io gives every game the same storage origin, so each localStorage key
// and IndexedDB database must carry STORAGE_PREFIX. This check is coarse: a
// file that touches browser storage must at least use the prefix.
const STORAGE_API =
  /\b(localStorage|sessionStorage|indexedDB)\b|from\s+["']idb-keyval["']/;

const sources = import.meta.glob<string>("/src/**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("browser storage", () => {
  it("is only touched by files that use STORAGE_PREFIX", () => {
    const unprefixed = Object.entries(sources)
      .filter(
        ([, source]) =>
          STORAGE_API.test(source) && !source.includes("STORAGE_PREFIX"),
      )
      .map(([file]) => file);
    expect(Object.keys(sources).length).toBeGreaterThan(0);
    expect(unprefixed).toEqual([]);
  });
});
