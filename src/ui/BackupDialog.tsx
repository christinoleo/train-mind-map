import { strings } from "./strings";

interface Props {
  /** Whether a backup loaded; without one the game starts over. */
  hasBackup: boolean;
  onBackup(): void;
  onNewGame(): void;
}

/** Shown at boot when the latest save fails to load (FR129). */
export function BackupDialog({ hasBackup, onBackup, onNewGame }: Props) {
  const text = strings.backup;
  return (
    <div class="crash" role="alertdialog" aria-labelledby="backup-title">
      <h1 id="backup-title">{text.title}</h1>
      <p>{hasBackup ? text.body : text.noBackup}</p>
      <div class="crash-actions">
        {hasBackup && (
          <button type="button" onClick={onBackup}>
            {text.load}
          </button>
        )}
        <button type="button" onClick={onNewGame}>
          {text.newGame}
        </button>
      </div>
    </div>
  );
}
