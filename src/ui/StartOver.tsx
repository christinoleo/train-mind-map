import { useState } from "preact/hooks";
import type { FailReason, Result } from "../sim/result";
import { strings } from "./strings";

export interface StartOverProps {
  /** Replaces the game with a new one. */
  newGame(): Promise<void>;
  /** Replaces the game with the save before the latest (FR129). */
  loadBackup(): Promise<Result<unknown>>;
}

type Choice = "backup" | "new";

/**
 * The ways out of a game that cannot go on: load the backup, or start a
 * new game. Both replace the current game for good, so each asks first, in
 * the page, as `confirm()` is missing in some hosts.
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
  const [confirming, setConfirming] = useState<Choice | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<FailReason | null>(null);

  async function run(choice: Choice) {
    setBusy(true);
    setRefused(null);
    try {
      const result = choice === "new" ? await newGame() : await loadBackup();
      if (result && !result.ok) setRefused(result.reason);
      else onDone?.();
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  function ask(choice: Choice, label: string) {
    return (
      <button
        type="button"
        class={buttonClass}
        disabled={busy}
        onClick={() => {
          setConfirming(choice);
          setRefused(null);
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <>
      {confirming === null ? (
        <>
          {ask("backup", strings.backup.load)}
          {ask("new", text.newGame)}
        </>
      ) : (
        <>
          <p class="menu-note">
            {confirming === "new" ? text.confirmNew : text.confirmBackup}
          </p>
          <button
            type="button"
            class={buttonClass}
            disabled={busy}
            onClick={() => void run(confirming)}
          >
            {confirming === "new" ? text.confirm : strings.backup.load}
          </button>
          <button
            type="button"
            class={buttonClass}
            disabled={busy}
            onClick={() => setConfirming(null)}
          >
            {text.cancel}
          </button>
        </>
      )}
      {refused && <p class="menu-refused">{strings.reasons[refused]}</p>}
    </>
  );
}
