import { useState } from "preact/hooks";
import type { FailReason, Result } from "../sim/result";
import { strings } from "./strings";

export interface StartOverProps {
  /** Replaces the game with a new one. */
  newGame(): Promise<void>;
  /** Replaces the game with the save before the latest (FR129). */
  loadBackup(): Promise<Result<unknown>>;
}

/**
 * The ways out of a game that cannot go on: load the backup, or start a
 * new game once the player confirms it. The confirmation is in the page, as
 * `confirm()` is missing in some hosts.
 */
export function StartOver({
  newGame,
  loadBackup,
  onDone,
  buttonClass,
}: StartOverProps & {
  /** Called once the game is replaced. */
  onDone?(): void;
  /** The class of the buttons, to match where they are shown. */
  buttonClass?: string;
}) {
  const text = strings.startOver;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<FailReason | null>(null);

  function run(action: () => Promise<Result<unknown> | void>) {
    setBusy(true);
    setRefused(null);
    void action().then((result) => {
      setBusy(false);
      if (result && !result.ok) setRefused(result.reason);
      else onDone?.();
    });
  }

  return (
    <>
      <button
        type="button"
        class={buttonClass}
        disabled={busy}
        onClick={() => run(loadBackup)}
      >
        {text.loadBackup}
      </button>
      {confirming ? (
        <>
          <p class="menu-note">{text.confirmNote}</p>
          <button
            type="button"
            class={buttonClass}
            disabled={busy}
            onClick={() => run(newGame)}
          >
            {text.confirm}
          </button>
          <button
            type="button"
            class={buttonClass}
            onClick={() => setConfirming(false)}
          >
            {text.cancel}
          </button>
        </>
      ) : (
        <button
          type="button"
          class={buttonClass}
          onClick={() => setConfirming(true)}
        >
          {text.newGame}
        </button>
      )}
      {refused && <p class="menu-refused">{strings.reasons[refused]}</p>}
    </>
  );
}
