import type { Signal } from "@preact/signals";
import { Menu } from "./Menu";
import { strings } from "./strings";

interface Props {
  /** True while the menu is open; it shares the other menus' place on screen. */
  open: Signal<boolean>;
  /** Shows the onboarding hints again from the first. */
  onReviewHints(): void;
}

/** The ⚙ button, beside undo, and the settings menu it opens. */
export function SettingsMenu({ open, onReviewHints }: Props) {
  const text = strings.settings;
  return (
    <>
      <button
        type="button"
        class="settings-toggle"
        aria-expanded={open.value}
        aria-label={text.title}
        title={text.title}
        onClick={() => (open.value = !open.value)}
      >
        {text.glyph}
      </button>
      {open.value && (
        <Menu
          label={text.title}
          title={text.title}
          onClose={() => (open.value = false)}
        >
          <button
            type="button"
            class="menu-action"
            onClick={() => {
              onReviewHints();
              open.value = false;
            }}
          >
            {text.reviewHints}
          </button>
        </Menu>
      )}
    </>
  );
}
