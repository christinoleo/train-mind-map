import { describe, expect, it } from "vitest";
import {
  FINAL_RESEARCH,
  LAB,
  RESEARCH,
  RESEARCH_IDS,
} from "../../src/data/research";
import { NODES } from "../../src/data/nodes";

describe("research", () => {
  it("costs what the GDD gives for the MVP (FR110)", () => {
    const cost = (id: keyof typeof RESEARCH) => RESEARCH[id].cost;
    expect(cost("splitter-merger")).toBe(10);
    expect(cost("tools-1")).toBe(10);
    expect(cost("tools-2")).toBe(10);
    expect(cost("extra-boxes")).toBe(20);
    expect(cost("edge-2")).toBe(30);
    expect(cost("railway")).toBe(50);
    expect(cost(FINAL_RESEARCH)).toBe(1000);
  });

  it("is paid in red science", () => {
    for (const id of RESEARCH_IDS) {
      expect(RESEARCH[id].pack).toBe("red-science");
    }
  });

  it("requires only researches listed before it, so none is unreachable", () => {
    for (const [i, id] of RESEARCH_IDS.entries()) {
      for (const required of RESEARCH[id].requires) {
        expect(RESEARCH_IDS.indexOf(required)).toBeLessThan(i);
      }
    }
  });

  it("puts Protótipo final after Ferrovia", () => {
    expect(RESEARCH[FINAL_RESEARCH].requires).toContain("railway");
  });

  it("unlocks only kinds that start locked", () => {
    for (const id of RESEARCH_IDS) {
      for (const effect of RESEARCH[id].effects) {
        if (effect.type !== "nodes") continue;
        for (const kind of effect.kinds) {
          expect(NODES[kind].unlock).toBe("research");
        }
      }
    }
  });

  it("has the Lab consume 1 pack every 5 s (FR40)", () => {
    expect(LAB.seconds).toBe(5);
    expect(NODES.lab.inputs).toBe(1);
    expect(NODES.lab.outputs).toBe(0);
  });
});
