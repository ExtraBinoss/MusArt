# Changelog

All notable changes are recorded here in English. MusArt uses a synchronized [Semantic Versioning](https://semver.org/) release number across its workspaces.

## [Unreleased]

### Added

- **Creative editor:** a central canvas, floating left toolbar, project menu and pill, page tabs, top-right export, and a pinned inspector split from the layers panel with resizable dividers.
- **Themes and accessibility:** English and French interface resources, light/dark/system themes, saturated blue primary controls, shadcn/Radix Select, Tabs, menus, dialogs and Kbd hints, and tooltips without decorative arrows.
- **ResumI controls:** reusable scrub-label numeric inputs with direct typing, units, snapping, keyboard editing, cancellation and one committed edit per gesture.
- **Document engine:** validated portable projects, multiple pages, nested layers and groups, selection, atomic command transactions, undo/redo, alignment, distribution and world/local geometry utilities. Commands are dispatched through a typed registry to domain-specific handlers.
- **Layer editing:** rename, duplicate, reorder, group, ungroup, visibility, locking, opacity, transforms, image aspect locking, text content and typography, fills, strokes and layer-specific effects.
- **Shapes and artwork:** a unified last-used shape tool with long-press, right-click and keyboard access to searchable, virtualized shape/icon/brand catalogs copied from ResumI. Original multicolor paints and attribution are retained; supported SVG artwork can be imported as editable vector data.
- **Guides and layout:** editable page/layer guides, draggable rulers, margins, padding, snapping, alignment and distance arrows, including nested group transforms. Social and print presets include appropriate dimensions, editable safe areas and real platform marks.
- **GPU composition:** Three.js WebGPURenderer, React Three Fiber and TSL, with the same node graphs on the WebGL fallback. Retained render targets, ping-pong effects, normal-layer batching, isolated groups, bounded resource caches and demand rendering keep intermediate pixels on the GPU.
- **Blending:** 24 layer/group blend modes, including darkening, lightening, contrast, difference and hue/saturation/color/luminosity families, with alpha-aware compositing.
- **Effects and corrections:** 20 modular GPU effects and adjustments: dither, ASCII, brightness, contrast, grayscale, blur, exposure, saturation, hue, vibrance, temperature, tint, gamma, invert, sepia, threshold, posterize, grain, halftone and vignette.
- **Color workspaces:** sRGB, Display-P3 working-space conversion to the current sRGB output, and a generic CMYK soft proof. Raster exports remain RGB; the proof does not claim ICC press-profile support.
- **Masks and selections:** non-destructive asset and layer/group masks, alpha/luminance coverage, inversion, enable/disable controls, mask drag/drop affordances, dependency-cycle validation, a connected-color magic wand and local SlimSAM object segmentation.
- **Import and export:** bounded bulk image imports, drag/drop and clipboard handling, portable `.musart` documents with originals, PNG/WebP/JPEG through native browser encoders, multi-page ZIP exports, and reusable GPU render sessions.
- **Local projects:** IndexedDB manifests and original assets stored separately, transactional writes, coalesced autosave and restoration of the last project.
- **Project library:** paginated cards, creation, opening, inactive-project renaming, duplication and deletion; persistent high-quality page thumbnails with hover, swipe and keyboard navigation.
- **Thumbnail pipeline:** native WebP encoding, revision checks, lazy blob URL leases, a bounded retained GPU session and idle scheduling that pauses during interaction. Deleted projects and stale page revisions cannot be republished by delayed jobs.
- **Storage insights:** per-project logical payload breakdowns, cached incremental counters for originals, thumbnails and history, and a separately labelled browser origin storage estimate. Projects expose a confirmed clear-history action.
- **Durable creative history:** an automatically recorded journal separate from the project manifest. It stores completed transactions as compact deltas and action summaries, with sparse checkpoints, original-asset pooling, bounded pagination and adjustable retention from 10 to 100,000 entries; the default is 10,000.
- **Timelapses:** deterministic replay and scrubbing in Animate, a separate JSON history export, and MP4/WebM encoding through Mediabunny from a retained GPU canvas with explicit timestamps and encoder backpressure.
- **Headless tools:** document creation, atomic command application, still rendering and editor screenshots, plus an opt-in automation API for document, history and thumbnail operations.
- **Branding:** the supplied transparent MusArt logo, favicon, Apple Touch icon and installation icons, preserving the original artwork and resolutions.
- **Open-source preparation:** MIT project license, English README and contribution documentation, preserved third-party licenses, local asset provenance, and official Meta/Cerebral Valley hackathon references.
- **Version management:** synchronized workspace versions, a deterministic version checker and a release script that moves reviewed `Unreleased` notes into dated releases.

### Changed

- Live colors, opacity, geometry and effect parameters use imperative previews and stable GPU uniforms. The document remains unchanged until the gesture commits; multiple selected layers share a single preview patch.
- Trackpad scrolling pans horizontally and vertically. Ctrl/Cmd+wheel anchors zoom to the pointer, while 100%, fit and recenter controls restore orientation.
- Original images are uploaded and reused across composition updates; vector paths are triangulated once per geometry identity. Guide, margin and padding metadata no longer invalidates painted layer sources.
- Project opening and saving avoid historical event scans. History pages are capped at 100 entries, and indexed checkpoints bound retention work.
- New project and original-mask IDs use durable UUIDs at web persistence boundaries. The pure engine retains its deterministic session-local allocator.
- Documentation records rendering contracts, TSL/WebGPU decisions, segmentation behavior, storage accounting and reproducible load-test protocols.

### Fixed

- Preserved stacking order when ungrouping layers and correct insertion positions when reordering an inverted layer list.
- Corrected render-target orientation through nested groups, masks, effects and exported images on both rendering backends.
- Corrected referenced mask coordinates, ancestor visibility/opacity handling and group confinement.
- Prevented color conversions, blend branches and GPU temporary values from producing incorrect output across backend fallbacks.
- Preserved SVG viewBox offsets, transforms, even-odd holes, `none` paints and inherited `currentColor`; rejected unsupported group-opacity structures instead of flattening them incorrectly.
- Made imported/brand artwork retain its original paints, while explicit fill changes enable recoloring and original colors can be restored.
- Removed the page-preview sentinel collision, corrected hit testing after paint-only updates and restored previews on pointer cancellation or lost capture.
- Prevented shortcuts from intercepting text fields, sliders, menus and other interactive controls.
- Protected the last valid GPU frame when a new allocation exceeds the cache budget; shared disposal waits for pending work and runs once.
- Prevented stale IndexedDB comparison caches, reserved identifier corruption, duplicate originals and partial import transactions.
- Reconciled restored documents by content fingerprint rather than timestamps alone; recovered journal writes with checkpoints after initialization or persistence failures.
- Made inactive renaming atomic with its journal entry, protected concurrent edits, and preserved exact accounting through legacy migrations, pruning and deletion.
- Cancelled abandoned StrictMode startup work before persistence, avoiding duplicate first-launch projects.

### Verification

- Deterministic rules reject tests under `src/`, missing mirrored tests, files over 600 lines, invalid core dependencies, native WebGPU engine code and production GPU readbacks.
- Coverage includes all executable sources with an 85% minimum for every metric and an independent core threshold. Oxlint type-aware checks, React Hooks checks and Oxfmt are part of the gate.
- Real browser tests compare GPU and fallback pixels, alpha, effects, masks, guides, live previews, exports, project management and video decoding.
- Reproducible workloads cover 50 local image layers with 100 effects and a native IndexedDB journal containing 100,000 entries. Reports count actual readbacks, React commits, resource changes and database reads/writes.
- Real pinned segmentation weights have been checked on WebGPU and in a fresh WASM worker with external networking blocked after caching.
