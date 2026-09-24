import type { EdgeLevel } from "./edges";
import type { ItemId } from "./items";
import type { NodeKind } from "./nodes";

/** The researches of the MVP, in the order the research panel lists them (FR110). */
export const RESEARCH_IDS = [
  "splitter-merger",
  "tools-1",
  "tools-2",
  "extra-boxes",
  "edge-2",
  "railway",
  "final-prototype",
] as const;

export type ResearchId = (typeof RESEARCH_IDS)[number];

/** What completing a research gives the player (FR18, FR76). */
export type ResearchEffect =
  | { type: "nodes"; kinds: readonly NodeKind[] }
  /** The Ferramentas level: an index into `TAP_YIELD`. */
  | { type: "tap"; level: number }
  | { type: "edge"; level: EdgeLevel }
  | { type: "box-capacity"; capacity: number };

export interface ResearchDef {
  /** Science packs the Labs consume to complete it. */
  cost: number;
  /** The science pack it consumes. */
  pack: ItemId;
  /** The researches that must be done before it can be chosen. */
  requires: readonly ResearchId[];
  effects: readonly ResearchEffect[];
}

// Costs from the GDD (§Meta do MVP, FR110): 120 packs up to Ferrovia, then
// 1,000 for Protótipo final. The GDD gives Ferramentas as one research of 10
// that raises the tap to 2 and then 4; here it is two levels of 10 each.
// Caixas extras has no effect in the GDD yet; doubling the Box's 500 items is
// a placeholder for the balancing sheet.
export const RESEARCH: Readonly<Record<ResearchId, ResearchDef>> = {
  "splitter-merger": {
    cost: 10,
    pack: "red-science",
    requires: [],
    effects: [{ type: "nodes", kinds: ["splitter", "merger"] }],
  },
  "tools-1": {
    cost: 10,
    pack: "red-science",
    requires: [],
    effects: [{ type: "tap", level: 1 }],
  },
  "tools-2": {
    cost: 10,
    pack: "red-science",
    requires: ["tools-1"],
    effects: [{ type: "tap", level: 2 }],
  },
  "extra-boxes": {
    cost: 20,
    pack: "red-science",
    requires: [],
    effects: [{ type: "box-capacity", capacity: 1000 }],
  },
  "edge-2": {
    cost: 30,
    pack: "red-science",
    requires: [],
    effects: [{ type: "edge", level: 2 }],
  },
  // Rail, Station and locomotive (GDD §Progressão). Until Epic 5 brings the
  // rail tools, the Station is all it unlocks.
  railway: {
    cost: 50,
    pack: "red-science",
    requires: [],
    effects: [{ type: "nodes", kinds: ["station"] }],
  },
  // The MVP's last research. It unlocks nothing: completing it ends the
  // prototype's content, and the game stays open (FR110).
  "final-prototype": {
    cost: 1000,
    pack: "red-science",
    requires: ["railway"],
    effects: [],
  },
};

/** The research whose completion ends the prototype's content (FR110). */
export const FINAL_RESEARCH: ResearchId = "final-prototype";

/** The science packs a Lab accepts: those some research consumes. */
export const SCIENCE_PACKS: readonly ItemId[] = [
  ...new Set(RESEARCH_IDS.map((id) => RESEARCH[id].pack)),
];

/**
 * The Lab consumes 1 pack every `seconds` for the active research (FR40).
 * Its buffer holds `buffer` packs.
 */
export const LAB = { seconds: 5, buffer: 2 } as const;
