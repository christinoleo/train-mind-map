# Decision Log — train-mind-map GDD

## 2026-09-24 — v0.1 (Create)

- Input: the final game brief at `_bmad-output/planning-artifacts/briefs/brief-train-mind-map-2026-09-24/brief.md`, plus its addendum (research digest).
- The user prefers the fast path and wants questions asked through AskUserQuestion. The document is written in pt-BR.
- **Game type:** Simulation (primary) with Idle/Incremental sections. Both genre guides are used.
- **Economy:** science packs, as in Factorio. Labs consume produced items to research. There is no currency; the graph itself is the economy.
- **Map:** procedurally generated from a seed. This fits the prestige stretch goal (a new map on each reset).
- **Trains (user):** "The train side has to be a real train system: it needs interchanges, and tracks can cross but trains must not collide. Imagine a real rail system, but on a layer separate from the normal edges." Rails live on their own layer, independent of the edge graph. Rails may cross each other through junctions or interchanges, and train-on-train collisions must be prevented.
  - **CONFLICT with the brief:** the brief said "no Factorio-style signals; simple Mini Metro lines". Collision avoidance brings back some form of signalling or reservation. Surfaced to the user for resolution.
- **Train collisions:** automatic reservation. A train reserves the next segment or junction before entering it, and other trains wait. There are no manual signals. This resolves the brief conflict: the "no Factorio signals" spirit is kept, and the puzzle lives in the layout (double track, sidings, junctions).
- **Stations:** a station is a node on both layers. It is a node in the factory graph (edges come in and go out) and a stop on the rail layer.
- **Recipe tree:** 30+ items up to the rocket, close to base Factorio. This grows the content scope compared with the brief's "reduced tree".
- **Offline progress:** simulated from the graph's throughput, up to a cap that research can raise.
- **Drafting defaults** (fast path; flagged for user review in the GDD): a Core node as the global inventory that pays for construction; fuel (coal) with no electric grid; infinite resource deposits; initial tuning numbers.
- **Validation and reconciliation run (v0.1).** Autofixes applied: the node Junção renamed to Mesclador; map expansion worded consistently as rings; Expansão 3 added to the tree; rail-under-node contradiction removed; reference devices (Galaxy A52, iPhone 11) and a memory target added; offline research clarified (labs don't consume offline); PWA committed; tech count set to ~20.
- **Bootstrap (user):** tier-1 nodes cost raw ore (Extractor = 10 iron ore + 5 stone; Fornalha = 10 stone), so manual clicks can pay for the start. Advanced nodes cost processed items.
- **Click cutover (user):** clicking is limited by an energy (stamina) bar: about 20 taps, recharging 1 per second. Automation scales without that limit.
- **Edge crossing (user):** there is NO bridge or tunnel for edges. Edges cost resources by length, have a maximum length and can never cross. Trains are the main escape for scaling. This departs from the brief, which proposed early bridges as a relief valve; the user decided the constraint holds and trains carry that role.
- **MVP (user):** includes minimal research (a Lab plus about 5 technologies, trains included) and a red-science goal.
- **Open (raised by user):** how construction resources move to and from the inventory on mobile. Resolving this next.
- **Inventory model (user):** boxes, as in Factorio. A Caixa node acts as a buffer or a store. Everything held in Caixas and in the Núcleo adds up to a visible **global stock**, and building debits that stock automatically. The player never carries or drags items. Drafting details: storage boxes are debited before buffer boxes, the nearest box first; each box has a "não usar em construção" option; items reach the build site instantly with a short animation.
- **No hand crafting (user):** the player cannot craft by hand. Taps give raw ore only, and the start chain works without crafting: tier-1 nodes cost ore, and Montadora 1 and Laboratório are available from the start with no research.
- **Validator majors resolved:** construction cost table added; base recipe times added; trains need no fuel; post-rocket free mode (rockets per hour, record per seed); emergence limits and save-scum addressed; MVP moved to "Lab + 5 research", with Ferrovia costing red science in the MVP only.

## 2026-09-24 — v1.0 (Finalized)

- Open items triaged; none blocks the architecture phase. Deferred:
  - [ASSUMPTION] No electric grid. Revisit if energy is needed as a decision layer.
  - [NOTE FOR DESIGNER] Train deadlock: detect and highlight, or prevent. Decide in the E5 prototype.
  - [NOTE FOR DESIGNER] Balancing spreadsheet (recipe quantities, advanced node costs). Produce in E7.
- doc_standards is empty, so no polish pass was run. No narrative flag was set. No external handoffs are configured.
- Status set to final. Next step: gds-game-architecture.

## 2026-09-24 — v1.1 (Update, user feedback after finalize)

- **Electricity (user):** there are no power lines or separate grid, but electricity must be produced, and any edge carries it to whatever is connected. Designed as:
  - Every connected component of edges forms a power "malha". Generators feed the whole malha.
  - Gerador burns 1 coal every 4 s for 10 ⚡. Painel solar gives 3 ⚡ (blue era). The Núcleo gives 3 ⚡ free for the bootstrap.
  - Per-node consumption values added. A shortage slows every node in the malha proportionally.
  - Furnaces no longer burn coal directly.
  - [ASSUMPTION] Rails also conduct power between stations. Awaiting user confirmation.
  - Supersedes the "no electric grid" assumption.
- **Balancing (user):** copy Factorio recipes as a placeholder for now.
- **Train deadlock:** the user did not understand it. Explained in chat; the note stays open for the E5 prototype.
- **Engine (user input for architecture):** it must be very light on mobile. The user doubts Godot or a full engine will hold up, and says diagram libraries are not optimized for this. Carry this to gds-game-architecture.

## 2026-09-24 — v1.2 (Update)

- **Rails conduct power (user confirmed).** The assumption is removed.
- **Every rail is double track (user):** one side for each direction. This removes head-on deadlock. Only a residual deadlock remains possible (cycles at junctions or full stations), which the game highlights; to be confirmed in the E5 prototype.
- **Post-MVP ideas (user):** rails with more tracks, and Factorio-style edge "buses" (parallel edges grouped together). Listed under Out of Scope as to be evaluated.
- **Engine (user):** TypeScript + PixiJS, with the simulation decoupled from rendering. Godot, Unity and diagram libraries were rejected. Input for gds-game-architecture.

## 2026-09-24 — v1.3 (Update from architecture validation)

- **Edge cost:** level 1 costs 1 iron ore per cell (user). The contradictory "placa de ferro" line is fixed.
- **Removing a node or edge, or changing a recipe (user):** the items inside are lost. The construction cost is still refunded at 100%.
- **Rail over rail (user):** crossing a rail creates an X automatically. Tapping the intersection toggles between X (trains go straight) and interchange (trains may switch track in any direction), which changes the routing graph.

## 2026-09-24 — Open design topic: scaling train automation

- **User:** wants train logistics to grow in scale over the game. It starts with one train between two stations and grows into automation driven by signals and requests, as in Factorio. The user wonders whether to include "everything" from Factorio. The idea is still maturing.
- Status: open, being discussed. Not yet reflected in gdd.md.

## 2026-09-24 — v1.4 (Train automation scale resolved)

- **Levels (user):** all of T1–T5 are in v1, with T5 (request network) as the climax before the Silo.
  - T1: fixed lines.
  - T2: station groups, train limits, depot.
  - T3: station rules.
  - T4: train rules / interrupts with the `{item}` wildcard.
  - T5: request network and dispatcher.
- **Logic UX (user):** rules are edited in forms. There are no wires or combinators, and no circuit layer.
- **Fixed lines with T5 (user):** they coexist. Each train is either in line mode or in dispatcher mode.
- **Where the fun lies (user):** "I like trains in Factorio because the three are factors that complement each other": designing the layout, programming the automation, and watching the network run itself. Added to Pillar 3.
- The architecture doc was updated (`sim/rail/rules.ts`, `sim/rail/dispatch.ts`, rule commands, `ui/RulesEditor`). The epics were updated (E5 now carries the automation scope).

## 2026-09-24 — v1.5 (MVP pacing, wayfinder issue #5)

- **Finding:** with the old numbers the train was pointless in the MVP. A chain of edges with 2 relay Boxes spans 30 cells for about 50 ore, versus about 185 processed items for a train, and MVP copper demand (~0.1/s) sat far below edge capacity. Raising demand alone does not fix it, because edges can run in parallel.
- **Decision (user):** edges are limited by length and by throughput, and the train wins on throughput. MVP demand goes up after the Ferrovia research: a sixth research, "Protótipo final", costs 1000 red science (about 20 min) and needs ~0.85 copper plates/s.
- **Map:** a small copper deposit (3×3, one Extractor, 0.5/s) sits near the base; a big copper deposit sits behind a 1-cell-wide land corridor between lakes that is at least 16 cells long. No relay Box fits, edges cannot span it, and only rail passes.
- **MVP goal (user):** no win goal. The only goal in the full game is the rocket. When "Protótipo final" completes, an "end of prototype content" notice appears and the game stays open.
- **Pacing (user):** keep the Ferrovia at about 30 min. The first-train target for the MVP is 25–45 min.

## 2026-09-24 — v1.6 (MVP map, wayfinder issue #6)

- **Construction (user):** the MVP map uses seed `mvp-1` for the base terrain, with a data-defined **Scenario** stamped on top (new glossary term in CONTEXT.md).
- **Revealed area (user):** 96² is revealed from the start, and the MVP has no expansion research.
- **Corridor (user):** straight, 1×20, between lakes.
- **Layout (user approved):**
  - Core 3×3 at (60,60);
  - iron 5×5, stone 4×4 and coal 4×4 at about 7–8 cells; the small copper deposit 3×3 at about 10 cells;
  - water in columns x 76–95 over the whole revealed height, except the land corridor at y=60;
  - the big copper deposit 6×6 at x 100–105, y 57–62;
  - the scenario clears water from the base area and from the rail route.
- **Acceptance tests:**
  - deposit distances and sizes;
  - exactly one gap in the water wall, 1 cell wide and 20 cells long;
  - no 2×2 node fits in the corridor;
  - the corridor length of 20 exceeds the maximum edge length of 12;
  - a rail route without water exists from the Core to the big copper deposit.

## 2026-09-24 — v1.7 (Hosting, wayfinder issue #9)

- **Host (user):** itch.io, as HTML5, on a public page. Every push to `main` publishes via GitHub Actions and butler (the `html5` channel).
- **PWA (user):** dropped, because itch.io strips service workers and manifests inside its iframe. FR145 and the PWA part of NFR14 are withdrawn.
- **Debug (user):** `?debug=1` only outside itch (dev server and preview).
- **iOS saves (user):** export/import (already in the MVP), plus a notice in the itch iframe on iOS suggesting an export. Cloud save is post-MVP.
- **Research facts:**
  - the itch storage domain is shared across all games, so keys use the `train-mind-map:` prefix;
  - Vite needs `base: './'`;
  - a build must stay under 1,000 files;
  - after the first push, set the page type to HTML by hand.

## 2026-09-24 — v1.8 (Touch UX, wayfinder issue #2)

- **The touch prototype was tested on a real phone** (branch `prototype/touch-ux`). It compared three schemes: A, drag and hold 300 ms to pin a bend; B, automatic routing; C, tap by tap. **B won.**
- **Edges are auto-routed** along the shortest orthogonal grid path, avoiding nodes, water and edges, with a deterministic tie-break. There is no manual bend editing: to change a route, recreate the edge or move nodes. Moving a node re-routes the attached edges and is refused if any edge becomes invalid. See ADR-0007.
- **Confirmed as is:** 2×2 and 3×3 node footprints, connector hit areas of 44 px or more, a 500 ms long press to move, and two-finger pan and pinch with edge auto-pan.

## 2026-09-24 — Rendering performance (wayfinder issue #3)

- **Measured on a real iPhone** (iOS 18.7, 430×873 at 3× DPR; a newer model than the iPhone 11 reference), in a cross-origin iframe with the stress page from #17:
  - **5,000 visible items + 20 trains, LOD off: 60.1 FPS average, 30.5 at the 1% low, p99 frame 20 ms, sim update 1.4 ms.** That is 5× the target load.
  - The WebGL context-loss recovery works on both platforms (as reported by the designer).
- **iOS Low Power Mode caps the game at 30 FPS.** With it on, 1,000 and 5,000 items both gave exactly 33.3 ms per frame, which confirms the cap is external.
- **Decision:** the render architecture (a single Pixi app, `ParticleContainer`, culling, LOD) is confirmed with no changes. Galaxy A52 numbers are still wanted when that device is available, but they are not blocking.

## 2026-09-24 — v1.9 (Visual language, wayfinder issue #7)

- **Visual prototype** (branch `prototype/visual-blueprint`): it compared A (cyanotype technical drawing), B (node-editor cards) and C (schematic symbols). **The designer chose B**, which replaces the "blueprint" art direction.
- **Node-editor style:**
  - slate background (`#1b1f27`);
  - rounded cards with a header coloured by category;
  - state shown as a pill plus an outline (red = blocked or starved, yellow = no power);
  - edges tinted by their item;
  - a floating capsule HUD, with the palette in a bottom tray.
- **Confirmed on the phone:** node states read clearly, items are distinguishable by colour plus shape, and the HUD is legible.
- Pinch zoom was absent from the prototype by design (it had zoom buttons only). Real pinch comes from Epic 1 task #15 and was already validated in #2.

## 2026-09-24 — v1.10 (Rail and station UX, wayfinder issue #8)

- **Rail touch prototype** (branch `prototype/rail-ux`): it compared A (draw by hand), B (auto-route between stations) and C (tap A then B to create rail, line and train together). **B won**, with one addition: the player picks the platform ends (left or right) where the rail leaves and arrives. The drag start and the release point set them.
- **Crossings:** an X is drawn as plain rails crossing, with no badge. An interchange is drawn as a small rail roundabout. Tapping toggles between them.
- **Confirmed:** a horizontal 3-cell station platform, the X/interchange tap toggle, the Line panel (stops, departure conditions, throughput, + train) and the layer toggle with dimming.
- ADR-0007 was extended to cover rails.

## 2026-09-24 — v1.11 (Station as a regular node)

- **Designer feedback on the rail prototype:** the separate horizontal-platform art for stations was confusing. **A Station is a regular node card**, like every other node, with **rail ports**: circles from which rail lines leave. The MVP has 1 rail port on the left and 1 on the right; this should grow to 2–3 per side later. Rails connect rail port to rail port with auto-routing. Trains stop at the node itself.
- This supersedes the "choose the platform end" detail from v1.10: picking a rail port is picking the side. **Rail port** joins CONTEXT.md. FR41 and FR79 are updated, and Epic 5 tasks #49 and #50 are written this way.
