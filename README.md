# train-mind-map

A factory builder in the spirit of Factorio, played in a mobile browser. The factory is a **node graph** (mind map) drawn on a 2D resource map. Edges carry items and power, and they **never cross**. A separate double-track **rail layer** moves items in batches, and its automation grows in five tiers, from a fixed line up to a request-driven network. The game starts as a clicker, turns into an idle game, and ends when you launch a rocket.

- **Stack:** TypeScript and PixiJS 8 (WebGL), built with Vite and shipped as a PWA.
- **Planning:** the design documents live in [`_bmad-output/planning-artifacts/`](_bmad-output/planning-artifacts/). They include the game brief, the GDD, the game architecture and the requirements inventory. The route from here to the MVP is tracked as a wayfinder map in this repo's GitHub issues.

## Stress test

`stress.html` is a standalone rendering stress test for real phones (wayfinder ticket #3). It moves 1,000 items along 200 edges with a `ParticleContainer`, runs 20 trains, culls everything outside the viewport and, with LOD on, draws edges as coloured strokes instead of items at far zoom. It opens zoomed out with LOD off, so every item is drawn: the target load. The panel shows FPS (average and 1% low), frame time, JS heap (Chrome only), device pixel ratio and renderer. Its buttons change the item count (500 to 5,000), turn the trains and the LOD on or off, and force a WebGL context loss that recovers after one second.

To run it on a phone, put the phone on the same Wi-Fi network as the computer:

1. Build and serve the production bundle on the LAN:

   ```bash
   npm run build
   npm run preview -- --host
   ```

   For a quick check you can use the dev server instead: `npm run dev -- --host`. Measure with the production build, since the dev server is slower.

2. Vite prints a `Network:` address, such as `http://192.168.0.10:4173/`. Open that address on the phone with `/stress.html` appended. On WSL2, the address must be the Windows host's LAN IP, and Windows must forward the port to WSL (for example `netsh interface portproxy add v4tov4 listenport=4173 connectport=4173 connectaddress=<WSL IP>`) and allow it through the firewall.
3. Leave the page running for at least 10 seconds at each setting you want to measure. Pan with one finger and pinch to zoom.
4. Tap **copiar resultados**. Over plain `http` the clipboard is often blocked; the JSON then appears in a text box below, selected, ready to copy by hand. Paste it into ticket #3.

The JSON records the device, the renderer and GPU, the settings, FPS and frame-time statistics over the last 600 frames, the JS heap and every context loss: how long the context stayed lost (`lostMs`) and how long the first frame after the restore took (`recoveryMs`). Memory on iOS is not exposed to the page, so measure it with Safari Web Inspector (Timelines, Memory) from a Mac.
