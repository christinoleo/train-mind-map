import { describe, expect, it } from "vitest";
import css from "../../public/style.css?raw";

// The bottom of the screen is shared by the palette, the menus and the Line
// pick prompt (#76): these checks keep the palette from covering them.

/** The declarations of the first rule whose selector is exactly `selector`. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  expect(match, selector).not.toBeNull();
  return match![1];
}

function zIndex(selector: string): number {
  const match = /z-index:\s*(\d+)/.exec(rule(selector));
  return match ? Number(match[1]) : 0;
}

describe("the bottom of the screen", () => {
  it("stacks the menus above the palette", () => {
    expect(zIndex("#ui-root > .menu")).toBeGreaterThan(
      zIndex("#ui-root > .palette"),
    );
  });

  it("hides the palette while a menu or the Line pick prompt is open", () => {
    expect(rule("#ui-root:has(> :is(.menu, .line-pick)) > .palette")).toMatch(
      /display:\s*none/,
    );
  });

  it("keeps a menu within the screen, scrolling when it is long", () => {
    const menu = rule("#ui-root > .menu");
    expect(menu).toMatch(/max-height:\s*calc\(\s*100dvh/);
    expect(menu).toMatch(/overflow-y:\s*auto/);
  });
});
