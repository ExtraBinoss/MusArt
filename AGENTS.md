# MusArt contribution rules

Direct user instructions take precedence. Read the relevant architecture contracts and documentation before changing a subsystem.

## Architecture

- Organize code by responsibility in subdirectories. Keep public entry points short; avoid unrelated root files and empty wrappers.
- `packages/core` is pure TypeScript: documents, validation, commands, geometry, history and replay. No DOM, React, state-library, storage or GPU dependencies.
- `packages/render` owns Three.js resources, source preparation, composition, effects, caches and export. Portable documents contain no GPU resources.
- `apps/web` owns UI, presentation state, R3F integration and platform adapters. Document edits use validated engine commands.
- Use a typed command registry and domain handlers. Each effect owns its directory; registries contain definitions rather than large implementation switches.

## Stack and interaction

- Use Bun, strict TypeScript, React, Vite, Jotai, Motion, i18next and genuine shadcn/Radix components. Preserve copied components' provenance and licenses.
- Use Three.js `WebGPURenderer`, React Three Fiber and TSL, including Three's WebGL fallback. Do not introduce a native WebGPU engine, handwritten shader pipeline or alternative rendering framework.
- Keep composition, effects and masks on GPU textures. No production GPU pixel readbacks into JavaScript. Native image preparation and browser encoding are allowed.
- Render on demand, bound caches and queues, and dispose resources, workers, listeners, timers and object URLs explicitly.
- Continuous property previews use imperative subscriptions. They must not rerender App, Inspector, CanvasArea, EditorCanvas or EditorScene. Commit once per completed gesture, with one undo entry; cancellation restores the original value.
- Wheel/trackpad pans both axes. Ctrl/Cmd+wheel zooms around the pointer. Keep 100% reset, fit and recenter controls available.
- Keep UI text in English/French resources and documentation in English. Use the supplied MusArt brand assets without recoloring them.

## Persistence and concurrency

- Keep frequently changed metadata separate from original assets and large journals. Use bounded, lazy reads and incremental accounting.
- Persist related mutations atomically. Reject stale asynchronous results and concurrent overwrites; background work must not resurrect deleted data.
- Keep background GPU work out of active gestures. Use durable IDs at persistence boundaries; a session-local allocator cannot identify unopened records.
- Validate imported data and report real failures. Never simulate successful saving, rendering or exporting.

## Blocking quality gates

- No tests or test directories inside `src/`. Every executable source has an exact mirrored test: `src/layers/tree.ts` → `test/layers/tree.test.ts`. Declaration-only files are exempt.
- Maximum 600 lines per code, style, script and test file. Split by responsibility.
- Include every executable source in coverage. Require at least 85% each for statements, branches, functions and lines, with separate core thresholds. Do not hide sources, add coverage ignores or weaken checks.
- Require zero violations from `bun run check:rules`. Run the coverage-aware rules check after coverage.
- Verify values, transactions, undo/redo, cleanup and error paths. Use real headless browsers for rendering, gestures, decoded exports and screenshots; mocks do not prove GPU correctness.
- Before delivery, run reproducible GPU and storage load tests, including 50 image layers with effects. Instrument actual read APIs and React commits; report measured results and environment details.
- Have independent agents audit completed domains when requested. Fix findings and rerun affected checks.
- Run frozen installation, typecheck, lint, format, coverage, rules, production build and browser checks. Keep generated reports and captures in ignored `artifacts/`.
- On shared workstations, run heavy checks serially across agents with bounded workers/resources and low priority; follow `docs/performance/protocol.md` and stop on memory pressure.

## Versions, changelog and Git

- Use one synchronized Semantic Versioning release number across the root and workspaces. Check it with `bun run version:check`.
- **Every delivered feature and fix must have an English entry in `CHANGELOG.md`.** Add it under `Unreleased`, then prepare a dated release with `bun run release -- <version>` after validation.
- Put release details, completed work and measurements in the changelog and documentation, not in this file. Keep `AGENTS.md` focused on lasting contribution rules.
- Commit each verified feature or milestone separately. Stage deliberately; exclude secrets, dependencies, builds, coverage and artifacts.
- Preserve existing work and Git history. Do not rewrite or publish history without instruction.
