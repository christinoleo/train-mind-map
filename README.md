# train-mind-map

A factory builder in the spirit of Factorio, played in a mobile browser. The factory is a **node graph** (mind map) drawn on a 2D resource map. Edges carry items and power, and they **never cross**. A separate double-track **rail layer** moves items in batches, and its automation grows in five tiers, from a fixed line up to a request-driven network. The game starts as a clicker, turns into an idle game, and ends when you launch a rocket.

- **Stack:** TypeScript and PixiJS 8 (WebGL), built with Vite and shipped as a PWA.
- **Planning:** the design documents live in [`_bmad-output/planning-artifacts/`](_bmad-output/planning-artifacts/). They include the game brief, the GDD, the game architecture and the requirements inventory. The route from here to the MVP is tracked as a wayfinder map in this repo's GitHub issues.
