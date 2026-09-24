import type { FailReason } from "./result";

/** Everything the simulation reports. Names are in the past tense. */
export type SimEvent = {
  type: "CommandRejected";
  command: string;
  reason: FailReason;
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
      for (const handler of this.handlers[event.type] ?? []) {
        (handler as Handler<typeof event.type>)(event);
      }
    }
  }
}
