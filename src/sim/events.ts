import type { RawResource } from "../data/items";
import type { ResearchId } from "../data/research";
import type { Rect } from "./geometry/rect";
import type { FailReason } from "./result";
import type { NodeStatus } from "./state/gameState";
import type { NodeId } from "./state/ids";
import type { Draw } from "./state/stock";

/** Everything the simulation reports. Names are in the past tense. */
export type SimEvent =
  | { type: "CommandRejected"; command: string; reason: FailReason }
  | { type: "NodeStatusChanged"; node: NodeId; status: NodeStatus }
  | {
      /**
       * Storage paid for building a node or an edge on the cells `site`;
       * `draws` says from where.
       */
      type: "ConstructionPaid";
      site: Rect;
      draws: Draw[];
    }
  | {
      /**
       * A manual tap on cell (x, y) sent `count` of `item` to the Core. It is
       * the audio hook too: the "tic" plays on it (FR74).
       */
      type: "ManualTapped";
      x: number;
      y: number;
      item: RawResource;
      count: number;
      core: NodeId;
    }
  | {
      /**
       * The Labs completed `research`, and its content is unlocked. It is the
       * audio hook for the research jingle too (FR116).
       */
      type: "ResearchDone";
      research: ResearchId;
    };

export type SimEventType = SimEvent["type"];
export type SimEventOf<T extends SimEventType> = Extract<SimEvent, { type: T }>;

/** The only thing the simulation sees of the event queue: it emits, never listens. */
export type Emit = (event: SimEvent) => void;

type Handler<T extends SimEventType> = (event: SimEventOf<T>) => void;

/**
 * Collects events during a tick. The main loop drains it after each tick,
 * delivering every event to its subscribers in emission order.
 */
export class EventQueue {
  private pending: SimEvent[] = [];
  private handlers: { [T in SimEventType]?: Handler<T>[] } = {};

  readonly emit: Emit = (event) => {
    this.pending.push(event);
  };

  on<T extends SimEventType>(type: T, handler: Handler<T>): () => void {
    const list: Handler<T>[] = (this.handlers[type] ??= []);
    list.push(handler);
    return () => {
      list.splice(list.indexOf(handler) >>> 0, 1);
    };
  }

  drain(): void {
    const events = this.pending;
    this.pending = [];
    for (const event of events) {
      // A copy, so a handler may unsubscribe itself mid-delivery.
      for (const handler of [...(this.handlers[event.type] ?? [])]) {
        (handler as Handler<typeof event.type>)(event);
      }
    }
  }
}
