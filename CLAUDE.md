# train-mind-map

A Factorio-like factory builder for the mobile web. The factory is a node graph whose edges never cross, and trains are the escape. The planning documents live in `_bmad-output/planning-artifacts/`: the game brief, the GDD under `gdds/`, `game-architecture.md` and `epics.md`, the requirements inventory. The architecture is binding for code: TypeScript + PixiJS, and `src/sim/` stays pure and deterministic.

## Agent skills

### Issue tracker

Issues and the wayfinder map live in GitHub Issues on `christinoleo/train-mind-map`, driven through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage labels are used as-is (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Dev commands

- `npm run dev`: start the Vite dev server on port 8080.
- `npm run build`: type-check with `tsc`, then build the production bundle into `dist/`.
- `npm run preview`: serve the production build locally.
- `npm run lint`: run ESLint with Prettier. It also enforces the layer boundary: `src/sim/` may import only `sim/`, `data/` and `config/`.
- `npm test`: run the Vitest suite once. Tests live in `tests/`, mirroring `src/`.

CI (`.github/workflows/ci.yml`) runs lint, test and build on every push to `main` and every pull request. The official PixiJS agent skills are copied into `.claude/skills/pixijs*` from `node_modules/pixi.js/skills/`; refresh them after upgrading `pixi.js`.

## Standing decisions for workers

- Until the MVP playtest there are no player saves to protect. A PR that adds a save-schema migration may be merged by its worker without asking; there is no need to label it `needs-help`.
