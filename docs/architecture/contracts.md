# Build contracts

- `packages/core`: serializable model, validation, immutable engine, history, and geometry. No DOM, React, or GPU dependencies.
- `packages/render`: GPU texture/RenderTarget composition and TSL effects confined to a layer/group; image sources upload directly and text sources are prepared when needed. Zero GPU readback into JavaScript; export uses a GPU canvas and the browser encoder. The same graph feeds R3F and export. The R3F adapter lives in `apps/web/src/canvas`.
- `apps/web/src/services`: IndexedDB, import, save, segmentation, and automation.
- `apps/web/src/components`: shadcn/Radix interface. Jotai owns presentation state; document commands go through `EnginePort`.
- Keep behavior tests in the relevant `test/` tree, never under `src/`. Exact per-file mirrors are optional; integration tests may cover several source files. Preserve meaningful regressions and full source coverage rather than adding mechanical wrapper or re-export tests. Maximum 600 lines per source, script, or test file; lockfiles and documentation are exempt.
- V8 coverage: minimum 85% for statements, branches, functions, and lines; include all source files without convenience exclusions. Use real browser tests for GPU rendering and exports.
- Layer arrays run from background to foreground. `parentId` identifies a group; its children use coordinates relative to that group. Rotation is in degrees around the layer's center; x/y identify its upper-left corner. Groups are isolated and own their surfaces, effects, and masks.
- Original assets are embedded in portable JSON `.musart` projects; no server is required.
