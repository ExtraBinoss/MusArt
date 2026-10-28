# MusArt

An open-source, local-first creative editor for images, typography, shapes, masks, and GPU effects. A reusable document engine sits underneath a React interface with a central canvas, a floating tool palette, and a resizable inspector and layers panel.

**Development snapshot:** stabilization and release validation are ongoing. See the [current verification status](docs/stabilization.md); this snapshot is not a tagged release.

Built for the **2026 Meta Global AI Developer Hackathon**, hosted by **Meta and Cerebral Valley**, with a **$1,000,000 total prize pool**. [Official Meta event](https://dev.meta.ai/events/global-hackathon) · [Cerebral Valley event page](https://cerebralvalley.ai/e/meta-ai-developer-hackathon).

The hackathon build period runs October 26–November 4, 2026. MusArt is an independent participant project.

## Run locally

Requirements: **Bun 1.4.2** and **Node.js 22.12 or newer**. Node 24 is used for validation.

```sh
bun install --frozen-lockfile
bun dev
```

The application runs at **http://localhost:6100**. The development and production preview servers both default to port 6100.

First launch opens the MusArt dashboard. Choose a template, create a custom canvas, or import a `.musart` project; no placeholder project is saved. Subsequent launches restore the last locally saved project.

```sh
bun run build
bun run preview
```

## Create

- Import multiple images together through the file picker, drag and drop, or clipboard. Pasted text becomes an editable text layer.
- Arrange image, text, vector, rectangle, ellipse, and nested group layers. Preview stacking and nesting while dragging, then commit the change on drop; Escape restores the original order. Alt-drag a layer onto another to use it as a mask. Selection, renaming, visibility, locking, duplication, grouping, and ungrouping remain available.
- Edit position, dimensions, rotation, opacity, blend mode, typography, fill, and stroke. Draw and transform directly on the canvas.
- Render text from analytical GPU curves with local variable fonts, kerning and ligatures. Text supports solid, linear and radial RGBA fills with up to eight stops, alongside existing masks, effects and blending. [Text rendering and limits](docs/rendering/analytical-text.md).
- Search a virtualized Google Fonts catalog by name or category, preview a family on selected text with the pointer or keyboard, and apply it as one undoable edit. Import TTF/OTF files into a persistent browser-wide font library. Where the browser supports Local Font Access, opening the picker requests system-font metadata automatically; the browser controls permission, and font files are read only when selected. [Font library and portability](docs/fonts.md).
- Apply modular GPU effects and color adjustments, including dither, ASCII, procedural gradients, blur, grain, halftone, exposure, hue and vibrance. Choose among 26 blend modes with isolated group compositing.
- Use a connected-color magic wand or local object segmentation to create image masks. Invert, disable, or remove a mask without changing the original image.
- Keep multiple artboards together in one project. Hover an artboard heading to reveal its add control, or add another from Magic Search and pinned dock commands. Choose social and print presets, drag guides from rulers, and edit layer/group margins, padding, alignment and spacing.
- Add the **AFTERHOURS — Techno** poster template from Magic Search, or pin its action to the dock. Its typography, shapes, groups and effects remain editable.
- Search the local ResumI shape, Lucide icon and brand libraries from one shape tool. Long-press or right-click to change the last-used artwork; import supported SVG paths with original paints and credits.
- Save projects in IndexedDB or download a portable `.musart` project containing its original assets. Autosave stores lightweight document changes separately from image originals.
- Export PNG, WebP, or JPEG using browser encoders, or export all compositions as a ZIP. The interface offers up to 4× export; the renderer enforces 16,384 pixels per side and 64 megapixels per image.
- Replay completed edits in Animate and export MP4 or WebM timelapses through Mediabunny. A separate paginated IndexedDB journal retains 10,000 entries by default, adjustable to 100,000; it loads independently from the document. [History design and tests](docs/history.md).

The MusArt logo opens the dashboard's **Projects** and **Templates** tabs. Project cards keep their page thumbnails, names and management actions together; hovering slides through artboards every 1.4 seconds. Cycling pauses for keyboard focus, hidden/offscreen cards and reduced-motion preferences. Names stay as text until you explicitly rename them, and card actions appear on hover or focus. The project-name button opens a popover for renaming, saving and downloading the portable project. Image imports stay in the dock. **Export** sits beside Design and Animate and opens a popover with an actual GPU preview: selected content is cropped by default, with explicit whole-artboard and ZIP options. Open the dashboard's settings gear or Magic Search for preferences, including the shortcut editor.

The right panel is pinned and resizable, with geometry, paint and typography above the layers list. Opacity and blend mode live at the top of Layers, with explicit mixed values for multiple selections. Hover or focus a blend option to preview it; Escape restores the original appearance, and selecting an option commits one edit. Expand a layer to edit its ordered effects and referenced mask in popovers; add effects and corrections from the footer, and group or ungroup through the layer context menu. Large trees mount a bounded visible row window. [Layer panel behavior](docs/ui/layer-panel.md). The interface supports English and French, light and dark themes, and keyboard-accessible shadcn/Radix controls.

Use **Ctrl/Cmd + K** or **…** in the left dock to open Magic Search. Browse categories or search tools, imports, layers, artboards, effects, project actions and keyboard shortcuts. Available actions use the same editor commands as the rest of the interface.

Open **Customize dock** to pin commands below the divider. The command list is virtualized, and the dock scrolls in short viewports with subtle boundary shadows and a thin scrollbar. Drag shortcuts to reorder them, or use the customization panel's move and unpin buttons with a keyboard. Dock preferences stay in the browser profile and do not enter project history. Downloaded and imported fonts also stay in the browser's font library; another device or browser profile needs the same custom fonts installed to render their project references.

## Navigate

Regular wheel and trackpad gestures pan on **both axes**. **Ctrl/Cmd + wheel** zooms around the pointer. The percentage button restores **100% zoom and recenters**; adjacent plus/minus controls change zoom. Fit remains available in Magic Search. A recenter button appears after panning. Hold Space and drag to pan.

| Action                    | Shortcut                             |
| ------------------------- | ------------------------------------ |
| Select / hand             | V / H                                |
| Shape / text              | U / T                                |
| Magic wand / segmentation | W / S                                |
| Undo / redo               | Ctrl/Cmd Z / Ctrl/Cmd Shift Z        |
| Save / duplicate          | Ctrl/Cmd S / Ctrl/Cmd D              |
| Group / ungroup           | Ctrl/Cmd G / Ctrl/Cmd Shift G        |
| Move selection            | Arrow keys; Shift for 10-pixel steps |

Local segmentation downloads pinned SlimSAM weights on first use. Image encoding is the expensive first step; later clicks reuse the cached embedding. Images stay on the device. See [local segmentation and offline validation](docs/SEGMENTATION.md).

## Rendering architecture

MusArt uses **Three.js `WebGPURenderer`**, **React Three Fiber**, and **TSL**. The same node materials support Three's WebGL2 fallback. There is no separately implemented native WebGPU renderer or handwritten WGSL/GLSL shader pipeline.

Images upload directly as textures. Shapes and text curve coverage are evaluated on the GPU; font outlines and layout are prepared when text geometry changes. Layer effects, group composition, alpha masks, transforms, and blending stay in GPU textures and render targets. Compatible normal layers are batched; effects and complex blends use additional GPU passes and ping-pong targets. Interactive parameters use stable uniforms.

Live inspector previews use stable imperative subscriptions to the scene and GPU uniforms. Continuous gestures do not rerender the canvas or unrelated panels; the active control may update its own cursor or draft. A validated document change and one undo entry are committed at the gesture boundary.

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

Working-space options include sRGB, Display-P3 converted to the current sRGB output, and a generic CMYK soft proof. PNG/JPEG/WebP exports remain RGB; the proof is not an ICC print profile. [Color and compositing details](docs/rendering/compositing.md).

## Test the 50-image scene

Open **http://localhost:6100/?benchmark=50** for the local contact sheet: **50 image layers, 100 effects, five groups, ten masks, and editable captions** on a 2400 × 1500 composition.

The 50 local 1280 × 960 JPEG assets come from ten Unsplash photographs with five crop/quality variants each. Source URLs, credits, sizes, and SHA-256 checksums are recorded in [the fixture manifest](apps/web/public/benchmark/manifest.json) and [attribution notes](apps/web/public/benchmark/ATTRIBUTION.md). No image CDN is contacted during the benchmark.

```sh
bunx playwright install --with-deps chromium
bun run test:browser -- test/browser/performance.spec.ts
```

The browser test verifies actual preview pixels, effect changes, undo/redo, autosave recovery, stable uploads and allocations, idle rendering, and export dimensions. It instruments real GPU/Canvas read APIs before the app loads and requires **zero application readbacks** during composition and export. Test-only image inspection happens in a separate browser page.

Results are written to `artifacts/performance-50.json`; captures and traces stay under `artifacts/`. Timings are specific to the recorded browser and adapter. See the [measurement protocol](docs/rendering/performance-protocol.md).

The native IndexedDB stress test uses 100,000 history entries and writes `artifacts/performance-history.json`. Run `bun run test:browser -- test/browser/history-performance.spec.ts` to repeat it. Live-property tests separately check changing pixels, zero editor React commits during scrubbing, and one undo entry, including a 50-image workload.

## Quality checks

```sh
bun run version:check
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

Features and fixes are recorded in the English [changelog](CHANGELOG.md). All workspaces share one Semantic Versioning release number, checked with `bun run version:check`; the [release workflow](CONTRIBUTING.md#prepare-a-release) prepares dated notes after validation.

MusArt source code is available under the **[MIT License](LICENSE)**. Third-party components, model weights, fonts, and Unsplash photographs retain their own licenses; see [provenance and notices](docs/PROVENANCE.md) and [third-party notices](THIRD_PARTY_NOTICES.md).
