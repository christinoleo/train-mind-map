import { ManualTap } from "../../sim/commands/manualTap";
import type { FailReason, Result } from "../../sim/result";
import type { GameState } from "../../sim/state/gameState";
import type { Camera } from "../camera";
import type { Tool } from "../controls";
import type { GesturePoint } from "../gestures";
import { worldToCell } from "../hitTest";

export interface TapToolDeps {
  state: Readonly<GameState>;
  camera: Camera;
  /** Validates and queues a command. */
  dispatch(command: ManualTap): Result;
  /** Why the last tap was refused, or `null` to clear it. */
  showHint(reason: FailReason | null): void;
}

/**
 * Refusals the player is told about. A tap on bare ground, a node or the
 * dark beyond the map is not an attempt at a tap, so it stays silent.
 */
const TOLD: readonly FailReason[] = [
  "no_stamina",
  "not_tappable",
  "storage_full",
];

/**
 * The tool active while nothing is being placed: a tap on a deposit mines
 * it by hand (FR74). A refused tap shows why until a tap succeeds, or, when
 * stamina ran out, until a point comes back.
 */
export class TapTool implements Tool {
  private told: FailReason | null = null;

  constructor(private readonly deps: TapToolDeps) {}

  tap(p: GesturePoint) {
    const { x, y } = worldToCell(this.deps.camera.toWorld(p.x, p.y));
    const result = this.deps.dispatch(new ManualTap(x, y));
    if (result.ok) this.tell(null);
    else if (TOLD.includes(result.reason)) this.tell(result.reason);
  }

  /**
   * A queued tap the simulation refused when it applied it: dispatch checks
   * against the state before the taps queued ahead of it in the same tick.
   */
  rejected(reason: FailReason) {
    if (TOLD.includes(reason)) this.tell(reason);
  }

  /** Clears the stamina hint once a point has come back. */
  refresh() {
    if (this.told === "no_stamina" && this.deps.state.stamina.points > 0) {
      this.tell(null);
    }
  }

  cancel() {
    this.tell(null);
  }

  private tell(reason: FailReason | null) {
    if (reason === this.told) return;
    this.told = reason;
    this.deps.showHint(reason);
  }
}
