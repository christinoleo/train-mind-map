import { useEffect, useState } from "preact/hooks";
import { strings } from "../ui/strings";
import { MAX_RING } from "./cheats";
import type { PerfSnapshot } from "./perf";
import type { GameConsole } from "./tools";
import "./debug.css";

const t = strings.debug;

/** Simulation speeds the panel offers (architecture §Ferramentas de debug). */
const SPEEDS = [0, 1, 10, 100];

interface Props {
  game: GameConsole;
  /** Subscribes to snapshot updates; returns the unsubscribe function. */
  subscribe(onSnapshot: (snapshot: PerfSnapshot) => void): () => void;
}

export function DebugPanel({ game, subscribe }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PerfOverlay game={game} subscribe={subscribe} />
      <button type="button" class="debug-toggle" onClick={() => setOpen(!open)}>
        {open ? t.close : t.admin}
      </button>
      {open && <AdminPanel game={game} subscribe={subscribe} />}
    </>
  );
}

/** Subscribes on its own, so a snapshot re-renders only this readout. */
function PerfOverlay({ game, subscribe }: Props) {
  const [perf, setPerf] = useState<PerfSnapshot | null>(null);
  useEffect(() => subscribe(setPerf), [subscribe]);
  if (!perf) return null;
  const { state } = game;
  const heap = perf.heapMb === null ? t.notAvailable : perf.heapMb.toFixed(1);
  let items = 0;
  for (const edge of state.edges.values()) items += edge.items.length;
  return (
    <pre class="debug-perf">
      {`FPS ${perf.fps.toFixed(0)} · ${game.loop.speed}×\n`}
      {`${t.tick} ${perf.tickMs.toFixed(2)} ms · ${t.render} ${perf.renderMs.toFixed(2)} ms\n`}
      {`${t.nodes} ${state.nodes.size} · ${t.edges} ${state.edges.size} · ${t.items} ${items} · ${t.trains} 0\n`}
      {`${t.heap} ${heap} MB`}
    </pre>
  );
}

function AdminPanel({ game, subscribe }: Props) {
  const { state, cheats, overlays } = game;
  const [seed, setSeed] = useState(state.map.seed);
  const [speed, setSpeed] = useState(game.loop.speed);
  const [cell, setCell] = useState({ x: "", y: "" });
  const [, redraw] = useState(0);
  const [replayError, setReplayError] = useState<string | null>(null);
  // A cheat command applies on a later tick, or never while paused, and undo
  // can revert it: the snapshots re-render the panel so it shows the state.
  useEffect(() => subscribe(() => redraw((n) => n + 1)), [subscribe]);
  const teleportTo =
    cell.x !== "" && cell.y !== "" ? [Number(cell.x), Number(cell.y)] : null;

  const rings = Array.from({ length: MAX_RING + 1 }, (_, i) => i);
  return (
    <div class="debug-panel">
      <form
        class="debug-row"
        onSubmit={(e) => {
          e.preventDefault();
          game.regenerate(seed);
        }}
      >
        <label>
          {t.seed}{" "}
          <input value={seed} onInput={(e) => setSeed(e.currentTarget.value)} />
        </label>
        <button type="submit">{t.regenerate}</button>
      </form>

      <div class="debug-row">
        <span>{t.speed}</span>
        {SPEEDS.map((s) => (
          <button
            type="button"
            class={s === speed ? "active" : ""}
            onClick={() => {
              cheats.setSpeed(s);
              setSpeed(s);
            }}
          >
            {s}×
          </button>
        ))}
      </div>

      <form
        class="debug-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (teleportTo) cheats.teleport(teleportTo[0], teleportTo[1]);
        }}
      >
        <span>{t.teleport}</span>
        {(["x", "y"] as const).map((axis) => (
          <input
            type="number"
            inputMode="numeric"
            placeholder={axis}
            value={cell[axis]}
            onInput={(e) => setCell({ ...cell, [axis]: e.currentTarget.value })}
          />
        ))}
        <button type="submit" disabled={!teleportTo}>
          {t.go}
        </button>
      </form>

      <div class="debug-row">
        <span>{t.revealRing}</span>
        {rings.map((r) => (
          <button
            type="button"
            class={r === state.map.revealedRing ? "active" : ""}
            onClick={() => cheats.revealRing(r)}
          >
            {r}
          </button>
        ))}
      </div>

      <div class="debug-row">
        <button type="button" onClick={() => cheats.giveItems()}>
          {t.giveItems}
        </button>
      </div>

      <div class="debug-row">
        <span>{t.replay}</span>
        <button type="button" onClick={() => game.replay.download()}>
          {t.exportReplay}
        </button>
        <label class="debug-file">
          {t.loadReplay}
          <input
            type="file"
            accept=".json,.txt,application/json,text/plain"
            onChange={async (e) => {
              const input = e.currentTarget;
              const file = input.files?.[0];
              input.value = "";
              if (!file) return;
              const result = game.replay.load(await file.text());
              setReplayError(result.ok ? null : strings.reasons[result.reason]);
            }}
          />
        </label>
        {replayError && <span class="debug-error">{replayError}</span>}
      </div>

      <fieldset class="debug-overlays">
        <legend>{t.overlays}</legend>
        {overlays.list().map(({ overlay, enabled }) => (
          <label>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                overlays.setEnabled(overlay.id, e.currentTarget.checked);
                redraw((n) => n + 1);
              }}
            />{" "}
            {overlay.label}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
