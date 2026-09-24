# Keep the simulation pure, deterministic and command-driven

`src/sim/` never imports PixiJS, Preact or the DOM, and it never reads the clock or `Math.random`. It advances in fixed 100 ms ticks. State changes only through queued commands, applied at the start of the next tick. One simulation therefore serves live play, offline catch-up, undo, replay and tests, and it can later move to a Web Worker without a rewrite. A lint rule enforces the import boundary.

## Considered Options

Running the simulation in a Web Worker from day one was rejected. It adds state serialization every tick and asynchronous input, with no measured gain at 500 nodes.
