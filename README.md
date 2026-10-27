# MusArt

An open-source, local-first creative editor for images, typography, shapes, masks, and GPU effects. A reusable document engine sits underneath a React interface with a central canvas, a floating tool palette, and a resizable inspector and layers panel.

Built for the **2026 Meta Global AI Developer Hackathon**, hosted by **Meta and Cerebral Valley**, with a **$1,000,000 total prize pool**. [Official Meta event](https://dev.meta.ai/events/global-hackathon) · [Cerebral Valley event page](https://cerebralvalley.ai/e/meta-ai-developer-hackathon).

The hackathon build period runs October 26–November 4, 2026. MusArt is an independent participant project.

## Run locally

Requirements: **Bun 1.4.2** and **Node.js 22.12 or newer**. Node 24 is used for validation.

```sh
bun install --frozen-lockfile
bun dev
```

The application runs at **http://localhost:6100**. The development and production preview servers both default to port 6100.

A sample composition opens on first launch; subsequent launches restore the last locally saved project.

```sh
bun run build
bun run preview
```

## Create

- Import multiple images together through the file picker, drag and drop, or clipboard. Pasted text becomes an editable text layer.
- Arrange image, text, rectangle, ellipse, and nested group layers. Select multiple layers, reorder them, rename them, toggle visibility and locks, duplicate, group, and ungroup.
- Edit position, dimensions, rotation, opacity, blend mode, typography, fill, and stroke. Draw and transform directly on the canvas.
- Apply ordered, non-destructive dither, ASCII, brightness, contrast, grayscale, and blur effects. Effects and masks stay confined to the target layer or group.
- Use a connected-color magic wand or local object segmentation to create image masks. Invert, disable, or remove a mask without changing the original image.
- Keep multiple compositions in one project, each with its own dimensions, background, and guides. Choose common print and social presets.
- Save projects in IndexedDB or download a portable `.musart` project containing its original assets. Autosave stores lightweight document changes separately from image originals.
- Export PNG, WebP, or JPEG using browser encoders, or export all compositions as a ZIP. The interface offers up to 4× export; the renderer enforces 16,384 pixels per side and 64 megapixels per image.

The logo menu contains projects, file operations, and settings. Export sits at the top right. The right panel is pinned and resizable, with properties and the color picker above the layers list. The interface supports English and French, light and dark themes, and keyboard-accessible shadcn/Radix controls.

## Navigate

Regular wheel and trackpad gestures pan on **both axes**. **Ctrl/Cmd + wheel** zooms around the pointer. The percentage button restores **100% zoom and recenters**; adjacent controls change zoom or fit the composition. A recenter button appears after panning. Hold Space and drag to pan.

| Action                     | Shortcut                             |
| -------------------------- | ------------------------------------ |
| Select / hand              | V / H                                |
| Rectangle / ellipse / text | R / O / T                            |
| Magic wand / segmentation  | W / S                                |
| Undo / redo                | Ctrl/Cmd Z / Ctrl/Cmd Shift Z        |
| Save / duplicate           | Ctrl/Cmd S / Ctrl/Cmd D              |
| Group / ungroup            | Ctrl/Cmd G / Ctrl/Cmd Shift G        |
| Move selection             | Arrow keys; Shift for 10-pixel steps |

Local segmentation downloads pinned SlimSAM weights on first use. Image encoding is the expensive first step; later clicks reuse the cached embedding. Images stay on the device. See [local segmentation and offline validation](docs/SEGMENTATION.md).

## Rendering architecture

MusArt uses **Three.js `WebGPURenderer`**, **React Three Fiber**, and **TSL**. The same node materials support Three's WebGL2 fallback. There is no separately implemented native WebGPU renderer or handwritten WGSL/GLSL shader pipeline.

Images upload directly as textures. Shapes are evaluated on the GPU; text prepares a source when its content changes. Layer effects, group composition, alpha masks, transforms, and blending stay in GPU textures and render targets. Compatible normal layers are batched; effects and complex blends use additional GPU passes and ping-pong targets. Interactive parameters use stable uniforms.

R3F presents the final texture with demand rendering. The production renderer does not read GPU pixels into JavaScript arrays. Exports present the same graph to a GPU canvas, transfer a browser image bitmap, and use native canvas encoders. Image decoding, text preparation, document commands, and browser file encoding still perform their necessary platform work.

```text
packages/core/src/
  document/      Versioned model, validation, IDs, factories, serialization
  layers/        Hierarchy, geometry, transforms, hit testing
  session/       Atomic commands and undo/redo
  effects/       Renderer-independent effect definitions and parameters

packages/render/src/
  surface/       Image textures, text sources, GPU shapes
  effects/       One folder per effect, shared uniforms, registry, ping-pong
  compositing/   Retained GPU graph, isolated groups, masks, blend passes
  cache/         Bounded GPU resource ownership and invalidation
  export/        GPU presentation and browser-native image encoding

apps/web/src/
  canvas/        R3F presentation, viewport, pointer interactions
  components/    Tools, projects, properties, layers, pages, export, UI primitives
  services/      Assets, local projects, selection workers, session, automation
  state/         Presentation state and translations
  styles/        Theme tokens and styles organized by editor area
```

`@musart/core` has no DOM, React, Jotai, Three.js, or storage dependencies. UI actions, shortcuts, and automation all use `EnginePort`. The app uses React, TypeScript, Vite, Bun, Tailwind, Jotai, Motion, i18next, lucide, shadcn/Radix, and react-colorful.

See [architecture contracts](docs/CONTRACTS.md), [Three/WebGPU notes](docs/rendering/three-webgpu.md), [TSL notes](docs/rendering/tsl.md), and [contribution rules](AGENTS.md).

## Test the 50-image scene

Open **http://localhost:6100/?benchmark=50** for the local contact sheet: **50 image layers, 100 effects, five groups, ten masks, and editable captions** on a 2400 × 1500 composition.

The 50 local 1280 × 960 JPEG assets come from ten Unsplash photographs with five crop/quality variants each. Source URLs, credits, sizes, and SHA-256 checksums are recorded in [the fixture manifest](apps/web/public/benchmark/manifest.json) and [attribution notes](apps/web/public/benchmark/ATTRIBUTION.md). No image CDN is contacted during the benchmark.

```sh
bunx playwright install --with-deps chromium
bun run test:browser -- test/browser/performance.spec.ts
```

The browser test verifies actual preview pixels, effect changes, undo/redo, autosave recovery, stable uploads and allocations, idle rendering, and export dimensions. It instruments real GPU/Canvas read APIs before the app loads and requires **zero application readbacks** during composition and export. Test-only image inspection happens in a separate browser page.

Results are written to `artifacts/performance-50.json`; captures and traces stay under `artifacts/`. Timings are specific to the recorded browser and adapter. See the [measurement protocol](docs/rendering/performance-protocol.md).

## Quality checks

```sh
bun run check:rules
bun run typecheck
bun run lint
bun run format:check
bun run test:coverage
bun run check:coverage
bun run test:browser
```

`bun run check` runs the complete gate and production build. Oxlint with type-aware analysis, ESLint React Hooks, and Oxfmt are pinned in the lockfile.

The deterministic TypeScript rules checker rejects tests inside `src/`, missing mirrored tests, code/style files over **600 lines**, invalid core dependencies, direct GPU readbacks, and native WebGPU rendering calls. The accepted result is **zero violations**.

Every executable source is included in coverage, including files not imported by a test. The minimum is **85% each** for statements, branches, functions, and lines, with separate thresholds for the core engine. Tests mirror source paths: `src/layers/geometry.ts` → `test/layers/geometry.test.ts`.

Browser scenarios run against the production build and exercise real WebGPU and WebGL fallback pixels. The separate `bun run test:segmentation` check downloads real model weights, then verifies a fresh WASM worker with external networking blocked. It requires the development server and an initial network connection, so it stays outside deterministic CI tests.

## Headless use

Create or modify documents with Bun alone:

```sh
bun run headless create --output artifacts/example.musart
bun run headless apply --input artifacts/example.musart --commands commands.json --output artifacts/changed.musart
```

`commands.json` contains an array of public `Command` objects. The transaction is atomic.

Start `bun dev` or `bun preview` before browser-backed rendering:

```sh
bun run headless render --input artifacts/example.musart --output artifacts/example.png --scale 2
bun run headless screenshot --input artifacts/example.musart --output artifacts/editor.png
```

Options include `--url`, `--page`, and `--webgl` for the TSL fallback. The automation port `window.musart` is enabled only with `?automation=1`.

## Contribute and license

Read [CONTRIBUTING.md](CONTRIBUTING.md) before making changes. Keep modules organized by responsibility, add mirrored tests, and commit each verified feature or milestone separately.

MusArt source code is available under the **[MIT License](LICENSE)**. Third-party components, model weights, fonts, and Unsplash photographs retain their own licenses; see [provenance and notices](docs/PROVENANCE.md) and [third-party notices](THIRD_PARTY_NOTICES.md).
