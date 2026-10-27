# MusArt — contribution rules

This project is a local-first creative editor. Read `PLAN_UNIVERSEL_EDITEUR_CREATIF.md` and `docs/CONTRACTS.md` before changing its contracts. Direct user instructions take precedence.

## Architecture and organization

- Organize code by responsibility in subdirectories: `document/`, `layers/`, `history/`, `effects/`, `selection/`, `projects/`, and so on. Do not accumulate twenty unrelated feature files at a module's root. A short public entry point remains acceptable.
- `packages/core`: versioned model, validation, geometry, atomic commands, and history; pure TypeScript without DOM, React, Jotai, Three, or storage dependencies.
- `packages/render`: sources and surfaces, isolated composition, GPU passes, caches, and export. Documents never contain GPU resources.
- `apps/web`: interface, presentation state, R3F viewport, and platform adapters. Every document mutation goes through `EnginePort`; buttons, keyboard shortcuts, and automation use the same commands.
- Reusable modules expose a small API through package exports. Do not create a giant utility file or artificially divide a behavior into empty wrappers.
- Dispatch document commands through a typed registry with handlers grouped by domain. Keep layer operations, page operations, guides, masks, and replay logic in their own directories; do not accumulate implementation in a large `switch` or `commands.ts` file.

## Stack and rendering

- React, strict TypeScript, Vite, Bun, Tailwind, Jotai, Motion, French/English i18next, lucide, and genuine shadcn/Radix components with preserved provenance.
- Three.js `WebGPURenderer` (`three/webgpu`), React Three Fiber, and TSL (`three/tsl`). The WebGL2 fallback uses the same renderer and TSL nodes. Do not introduce `WebGLRenderer`, `ShaderMaterial`, `RawShaderMaterial`, or a parallel GLSL shader pipeline.
- Render on demand. No continuous loop while idle. Effects and masks remain confined to their layer or group; preserve alpha.
- Use transient previews during gestures, with one document/history commit at the end. Bound caches and explicitly release resources, timers, listeners, and workers.
- Wheel/trackpad: pan on X/Y; Ctrl/Cmd+wheel: zoom around the cursor. The 100% control recenters the view; provide a button to find the document again.

## Live preview contract

Controls may update their own local cursor, thumb, or draft field, but continuous color, opacity, geometry-property, and effect previews must not rerender the canvas or the rest of the editor. Use stable imperative subscriptions from presentation state to GPU uniforms/scene updates; do not propagate preview values through React props or document state. Keep App, Inspector, CanvasArea, EditorCanvas, and EditorScene commit counters unchanged during a preview gesture. Commit the validated document once at the gesture boundary, producing one undo entry. Verify this behavior with real browser counters, changing pixels, stable renderer/context identity, and unchanged source uploads; unit mocks alone are insufficient.

## Required GPU pipeline

- Each effect owns its directory (`effects/dither/`, `effects/ascii/`, and so on), containing its TSL builder, helpers, and mirrored tests. The registry is a table of definitions, not a large switch containing effect logic.
- Keep preview sources, effect outputs, groups, masks, and composition on the GPU. Ping-pong between RenderTargets; R3F presents the final texture directly. Do not transfer a GPU result into a Canvas2D surface or JavaScript array.
- No `readRenderTargetPixels*`, `readPixels`, or `GPUBuffer.mapAsync(READ)` in production rendering code. Export renders onto a GPU canvas and uses the browser encoder. Preparing text sources and decoding an original image are distinct from GPU readback.
- Interactive parameters use stable uniforms. Pan/zoom does not recalculate sources; moving a layer does not reupload its image. Batch compatible layers into the same pass; complex blending and effects remain separate passes.
- Before delivery, run a reproducible workload of **50 image layers with effects**, using local photographs in `public/benchmark/`, with screenshots and cold/warm, interaction, memory, idle, and export measurements. Instrument actual read APIs to prove zero readbacks; a constant counter is insufficient.
- Once implementation is stable, have independent subagents review the UI, engine, and rendering domains, fix findings, and rerun the relevant checks.
- Preserve primary sources and Three/WebGPU/TSL notes in `docs/rendering/`, including version and date, so subsequent work can reuse the findings.

## Blocking quality requirements

- No tests, `.test.*`, `.spec.*`, `test/`, `tests/`, or `__tests__/` directories inside any `src/` directory.
- Every executable source has a mirrored test under `test/`: `src/layers/tree.ts` → `test/layers/tree.test.ts`. Apply this rule to applications and packages. Declaration-only `.d.ts` files are exempt.
- Maximum **600 lines** per code, script, and test file. Split by genuine responsibility before exceeding this limit.
- Minimum **85% for each metric**: lines, statements, functions, and branches; include all sources, including unimported files. Enforce a separate threshold for the core/engine. Do not exclude difficult code, add coverage ignores, or lower thresholds to make a command pass.
- Test values and behavior, errors, atomicity, undo/redo, effect confinement, alpha, save/reload, stale worker results, and cleanup. Do not replace a domain assertion with a snapshot or a meaningless check.
- Use a real headless browser to verify GPU rendering, gestures, readable exports, and screenshots. A successful build or a mocked GPU does not establish real rendering correctness.
- Zero violations from `bun run check:rules`; after coverage, run `bun scripts/check-rules.ts --coverage`.

## Verification and delivery

- `bun install --frozen-lockfile`, `bun run typecheck`, `bun run lint`, `bun run format:check`, `bun run test:coverage`, `bun run test:browser`, `bun run build`.
- Browser tests must also pass against a production build. Keep screenshots and reports in `artifacts/`, which Git ignores.
- Atomic IndexedDB persistence, coalesced autosave, and portable projects containing their original assets; no server dependency for creating, editing, saving, or exporting. An explicit initial download is allowed for the local segmentation model.
- Validate imported data. Provide visible, understandable errors; never simulate success. Do not claim performance, coverage, or compatibility without executed measurements.
- Preserve component, model, effect, and image licenses and provenance. Lock dependencies with a single `bun.lock`.
- Write project documentation in English. Keep the interface's French and English catalogs; documentation translation does not change product behavior.

## Git and milestones

- Track the repository with Git from the start. Create a separate commit for each verified milestone or completed feature; do not leave everything for a single final commit.
- Before committing, run the checks relevant to that scope. A feature commit must not conceal known failures in that feature.
- Use explicit messages (`feat(core): ...`, `feat(render): ...`, `test(performance): ...`, `fix(...): ...`) and a coherent scope.
- Select milestone files deliberately; do not include unrelated changes, secrets, `node_modules/`, `dist/`, `coverage/`, or `artifacts/`. Local fixture photographs and their license/provenance are authorized source assets.
- Preserve the user's history and changes. Do not rewrite or publish history without instruction.
