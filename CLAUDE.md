# train-mind-map

A Factorio-like factory builder for the mobile web. The factory is a node graph whose edges never cross, and trains are the escape. The planning documents live in `_bmad-output/planning-artifacts/`: the game brief, the GDD under `gdds/`, `game-architecture.md` and `epics.md`, the requirements inventory. The architecture is binding for code: TypeScript + PixiJS, and `src/sim/` stays pure and deterministic.

## Agent skills

### Issue tracker

Issues and the wayfinder map live in GitHub Issues on `christinoleo/train-mind-map`, driven through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage labels are used as-is (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
