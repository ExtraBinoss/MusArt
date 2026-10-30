# Melt contribution rules

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
- Keep UI text in English/French resources and documentation in English. Use the shared `apps/web/src/ui/brand` configuration, theme tokens and SVG mascot; preserve upstream notices and legacy portable-format and persistence identifiers.

## Persistence and concurrency

- Keep frequently changed metadata separate from original assets and large journals. Use bounded, lazy reads and incremental accounting.
- Persist related mutations atomically. Reject stale asynchronous results and concurrent overwrites; background work must not resurrect deleted data.
- Keep background GPU work out of active gestures. Use durable IDs at persistence boundaries; a session-local allocator cannot identify unopened records.
- Validate imported data and report real failures. Never simulate successful saving, rendering or exporting.

## Delegation

- When delegation is requested, assign independent implementation tasks with a concrete result, owned files and relevant regression checks. The coordinator implements remaining work while workers code.
- Keep one writer per file at a time. Agree shared interfaces once; hand off ownership explicitly before another agent edits the same files.
- Prefer a fresh, bounded context for independent tasks (`fork_turns: "none"`), with the applicable contribution rules, requirements and paths in the brief. Reuse an agent only for closely related follow-up work; avoid carrying an unrelated conversation history into a small fix.
- Normally use one assignment and one completion handoff per task. Send intermediate messages only for blockers, interface/ownership changes or new requirements. Do not reactivate agents for acknowledgments, status updates or repeated reviews.
- Name one validation owner per batch. Workers prepare meaningful regressions and report any checks already run; the owner runs the integrated focused checks once. Do not duplicate shared tests, static checks, builds or browser runs across agents.
- Route new requirements only to affected owners. Completion handoffs state the result, changed paths, checks actually run and remaining blockers concisely. Finish after relevant checks pass; additional audits require a concrete concern or user request.

## Verification and iteration

- Default workflow: implement the feature, run its focused code tests, then finish. Add a focused real-browser check when rendering or native interaction changes. Benchmark only performance-sensitive changes or when requested.
- Run explicit test paths or related tests during development; use watch mode for repeated edits. Do not run repository-wide coverage, every browser scenario, GPU/storage load suites or repeated builds for each feature or small fix.
- When local coverage helps, use `bun run test:coverage:changed -- <source-paths>` (or omit paths to select Git changes). It runs mirrored tests when all selected sources have them, otherwise related tests, and instruments only selected sources in a separate partial report. Use `test:coverage:related` when dependent consumers also need verification; shared barrel imports can broaden that selection. Never present partial coverage as repository-wide coverage.
- After a passing check, rerun only checks affected by subsequent changes. Stop an unsuitable test experiment once its failure is understood; do not keep collecting redundant failures. Investigate runner/setup overhead before accepting multi-minute focused tests.
- Keep tests outside `src/`, organized by behavior in the relevant `test/` tree. Add or update focused regressions for changed behavior; one integration test may cover several source files. Exact per-file mirrors are optional. Do not create mechanical tests for wrappers, re-exports or presentation-only edits; use existing behavior tests and relevant static or visual checks.
- Maximum 600 lines per code, style, script and test file. Split by responsibility.
- Full CI/release coverage includes every executable source and requires at least 85% each for statements, branches, functions and lines, with separate core thresholds. Do not hide sources, add coverage ignores or weaken assertions to speed up a run. Coverage is not required for each local iteration.
- Require zero violations from `bun run check:rules` before committing. Run the coverage-aware rules check whenever full coverage is run.
- Verify values, transactions, undo/redo, cleanup and error paths. Use real headless browsers for rendering, gestures, decoded exports and screenshots; mocks do not prove GPU correctness.
- Run GPU and storage load tests, including the 50-image effect workload, when the changed subsystem or a requested performance investigation warrants them. Instrument actual read APIs and React commits; report measured results and environment details.
- Have independent agents audit completed domains when requested. Fix findings and rerun affected checks.
- The complete frozen installation, typecheck, lint, format, coverage, rules, production build and browser gate belongs to CI and requested release preparation. Run relevant static checks locally without automatically repeating the full gate. Keep generated reports and captures in ignored `artifacts/`.
- On shared workstations, run heavy checks serially across agents with bounded workers/resources and low priority; follow `docs/performance/protocol.md` and stop on memory pressure.

## Versions, changelog and Git

- Use one synchronized Semantic Versioning release number across the root and workspaces. Check it with `bun run version:check`.
- **Every delivered feature and fix must have an English entry in `CHANGELOG.md`.** Add it under `Unreleased`. Prepare a dated release with `bun run release -- <version>` when a release is requested, after validation; do not release after every development iteration.
- Put release details, completed work and measurements in the changelog and documentation, not in this file. Keep `AGENTS.md` focused on lasting contribution rules.
- Commit each verified feature or milestone separately. Stage deliberately; exclude secrets, dependencies, builds, coverage and artifacts.
- Preserve existing work and Git history. Do not rewrite or publish history without instruction.
