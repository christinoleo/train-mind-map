import type { ReadonlySignal, Signal } from "@preact/signals";
import { useState } from "preact/hooks";
import {
  RESEARCH,
  type ResearchEffect,
  type ResearchId,
} from "../data/research";
import { TAP_YIELD } from "../data/tap";
import type { GameState } from "../sim/state/gameState";
import { researchList, type ResearchStatus } from "../sim/state/research";
import { strings } from "./strings";

/** What the research panel shows, published by the UI bridge. */
export interface ResearchInfo {
  active: ResearchId | null;
  researches: {
    id: ResearchId;
    status: ResearchStatus;
    /** Packs consumed so far. */
    progress: number;
    cost: number;
  }[];
}

export function researchInfo(state: Readonly<GameState>): ResearchInfo {
  return {
    active: state.research.active,
    researches: researchList(state).map(({ id, status }) => ({
      id,
      status,
      progress: state.research.progress[id] ?? 0,
      cost: RESEARCH[id].cost,
    })),
  };
}

function describe(effect: ResearchEffect): string {
  const text = strings.research;
  switch (effect.type) {
    case "nodes":
      return effect.kinds.map((kind) => strings.nodes[kind]).join(", ");
    case "tap":
      return `${text.tap} ${TAP_YIELD[effect.level]} ${text.tapItems}`;
    case "edge":
      return `${text.edge} ${effect.level}`;
    case "box-capacity":
      return `${text.boxCapacity} ${effect.capacity} ${text.boxItems}`;
  }
}

/** What a research gives, as one line. */
function unlocks(id: ResearchId): string {
  const { effects } = RESEARCH[id];
  return effects.length === 0
    ? strings.research.nothing
    : effects.map(describe).join(" · ");
}

interface Props {
  research: ReadonlySignal<ResearchInfo>;
  onChoose(id: ResearchId): void;
}

/**
 * The research button, at the bottom-right corner, and the panel it opens
 * (FR109): every research with what it unlocks and its progress in packs.
 * Tapping an open one makes it the research the Labs work on.
 */
export function ResearchPanel({ research, onChoose }: Props) {
  const [open, setOpen] = useState(false);
  const text = strings.research;
  const info = research.value;
  return (
    <>
      <button
        type="button"
        class="research-toggle"
        aria-expanded={open}
        aria-label={text.open}
        title={text.open}
        data-idle={info.active === null}
        onClick={() => setOpen(!open)}
      >
        {text.glyph}
      </button>
      {open && (
        <div class="menu research" role="dialog" aria-label={text.title}>
          <header class="menu-head">
            <span>{text.title}</span>
            <button
              type="button"
              class="menu-close"
              aria-label={strings.menu.close}
              onClick={() => setOpen(false)}
            >
              {strings.menu.closeGlyph}
            </button>
          </header>
          {info.active === null && <p class="menu-note">{text.none}</p>}
          <div class="research-list">
            {info.researches.map((r) => (
              <ResearchRow key={r.id} {...r} onChoose={onChoose} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function ResearchRow({
  id,
  status,
  progress,
  cost,
  onChoose,
}: ResearchInfo["researches"][number] & { onChoose(id: ResearchId): void }) {
  const text = strings.research;
  const requires = RESEARCH[id].requires;
  return (
    <button
      type="button"
      class="menu-action research-item"
      data-status={status}
      aria-pressed={status === "active"}
      disabled={status === "done" || status === "locked"}
      onClick={() => status === "available" && onChoose(id)}
    >
      <span class="research-name">
        {text.names[id]}
        <span class="menu-items">
          {status === "done" ? text.done : `${progress}/${cost} ${text.packs}`}
        </span>
      </span>
      <span class="research-bar">
        <span
          class="research-fill"
          style={{ width: `${(100 * progress) / cost}%` }}
        />
      </span>
      <span class="menu-items">
        {text.unlocks}: {unlocks(id)}
      </span>
      {status === "locked" && (
        <span class="menu-refused">
          {text.requires}: {requires.map((r) => text.names[r]).join(", ")}
        </span>
      )}
    </button>
  );
}

/**
 * A completed research, shown for a moment (FR116), and the end of the
 * prototype, which stays until the player closes it; the game keeps
 * running under it (FR110).
 */
export function ResearchNotice({
  completed,
  ended,
}: {
  completed: ReadonlySignal<ResearchId | null>;
  ended: Signal<boolean>;
}) {
  const text = strings.research;
  if (ended.value) {
    return (
      <div class="research-end" role="dialog" aria-label={text.endTitle}>
        <h2>{text.endTitle}</h2>
        <p>{text.endBody}</p>
        <button type="button" onClick={() => (ended.value = false)}>
          {text.endClose}
        </button>
      </div>
    );
  }
  if (completed.value === null) return null;
  return (
    <p class="research-done" role="status">
      {text.completed}: {text.names[completed.value]}
    </p>
  );
}
