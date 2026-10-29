# Interface and layout diagnostics

Use [Protocol](protocol.md) for isolation and clocks, [Canvas](canvas.md) for geometry/presentation, and [Storage](storage.md) for persistent thumbnail/history work. This page covers browser layout and React work around the editor.

## Ownership map

| Responsibility                                    | Source                                                                                                                                                                                                                                         |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared immutable selection analysis               | [layerSelection](../../apps/web/src/components/layers/menu/selection.ts), [App projection](../../apps/web/src/App.tsx)                                                                                                                         |
| Layer tree projection and virtual window          | [projection](../../apps/web/src/components/layers/tree/projection.ts), [use-virtual-rows](../../apps/web/src/components/layers/tree/use-virtual-rows.ts), [LayersPanel](../../apps/web/src/components/layers/LayersPanel.tsx)                  |
| Inspector and imperative fields                   | [Inspector](../../apps/web/src/components/properties/Inspector.tsx), [NumberInput](../../apps/web/src/components/shared/NumberInput.tsx), [ColorControl](../../apps/web/src/components/properties/ColorControl.tsx)                            |
| Font metadata and picker lifecycle                | [font properties](../../apps/web/src/components/properties/fonts)                                                                                                                                                                              |
| Closed command availability and open search index | [SearchCommands](../../apps/web/src/components/search/catalog/commands.ts), [SearchCatalog](../../apps/web/src/components/search/catalog/cache.ts), [MagicSearch](../../apps/web/src/components/search/MagicSearch.tsx)                        |
| Visible selected-content preview identities       | [SelectionPreviewIdentity](../../apps/web/src/services/projects/thumbnails/selection-identity.ts), [preview adapter](../../apps/web/src/services/session/editor-services.ts)                                                                   |
| Scroll shadows and observers                      | [shared scroll components](../../apps/web/src/components/shared/scroll)                                                                                                                                                                        |
| Native reorder lifetime                           | [layer drag](../../apps/web/src/components/layers/drag/use-layer-drag.ts), [stable virtual drag window](../../apps/web/src/components/layers/drag/window.ts), [dock projection](../../apps/web/src/components/toolbar/dock/PinnedCommands.tsx) |

Document mutations still go through the engine. Avoid moving domain logic into components to save a render; keep validation, undo and stale-origin guards intact.

## Native workloads

```sh
bunx playwright test test/browser/ui-stability.spec.ts test/browser/layer-controls.spec.ts --config artifacts/performance.config.ts --workers=1
bunx playwright test test/browser/search.spec.ts test/browser/keybindings.spec.ts --config artifacts/performance.config.ts --workers=1
bunx playwright test test/browser/color-picker.spec.ts test/browser/font-picker.spec.ts --config artifacts/performance.config.ts --workers=1
bunx playwright test test/browser/dock-layers.spec.ts --config artifacts/performance.config.ts --workers=1
```

Measure first/cold selection, repeated text/image selection, offscreen selection reveal, sustained Layers scrolling, held numeric/color gestures, mixed selection and cancellation/rebinding. For search, include the first real CmdK opening on a 10,000-element document, closing/reopening and actual bounded option DOM. Do not prebuild the cold document index merely to improve the reported opening time.

The maintained reports include `artifacts/search-opening-10000.json`, `layer-scroll-production.json`, `layer-scroll-production.trace.json`, `layer-scroll-production-attribution.json` and `ui-layer-scroll.json`. They are local ignored artifacts, may be overwritten, and must be archived with their cohort before another run. Read their environment/command/source provenance instead of assuming an old result describes current code.

## What to verify

- A continuous preview must leave the five outer editor React counters unchanged. A small picker component's internal rendering is not equivalent to rerendering App, Inspector, CanvasArea, EditorCanvas or EditorScene.
- Numeric/color controls retain their DOM across ordinary selection/value changes. Identity replacement cancels old pointer, keyboard and typed drafts; a held repeated key must not commit into a new target.
- Closed font pickers avoid full installed/catalog work. Installed metadata does not imply that original font bytes were read or imported.
- A closed spotlight updates command availability without document enumeration or search normalization. Static translated labels/shortcuts and the eight availability states have different invalidation from document labels/order/text.
- Shared selection predicates may reuse immutable page/selection pairs. Frozen container checks must also cover any nested array whose membership affects a cached predicate; mutable external inputs are rechecked.
- Layers uses a bounded virtual window. Scroll position metrics may update per pixel, but React should publish only when its window/height changes. Bucketed five-row overscan must still cover every visible row at fractional scroll offsets and the document's end.
- Offscreen reveal is scheduled after the selected canvas/Inspector paint and canceled when the selection/page changes. Avoid synchronous layout reads simply to discover an already-visible row.
- Only mounted visible preview rows request work. A local paint change should invalidate the selected dependency closure, not every visible thumbnail.

## Trace before optimizing

Use both a production non-tracing run and a separate CPU/Blink trace. Extra gaps in a development diagnostic require reproduction on the same frozen source/build before attributing them to the engine; changes made between two cohorts can otherwise be mistaken for development overhead.

Look for `getBoundingClientRect`, client/offset dimensions, native scroll access, Radix `use-size`, React mounting, style invalidation and native encoding in the exact input window. A stack under Playwright's own DOM visitor is not automatically application layout cost. Capture commit counts and actual visible row count alongside latency.

| Failure                                        | Likely boundary                                                                                                                        |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Every selected row remounts controls           | Value-based keys, unstable identities/props or regenerated tree projections                                                            |
| Scroll publishes React every pixel             | Virtual-window state tracks exact scroll position instead of a bounded visible bucket                                                  |
| Every preview row re-encodes after one edit    | Global project/revision key instead of the selected group/ancestor/mask/asset closure                                                  |
| Big first font selection only                  | Cold picker/control mount and metadata reads; preserve it as a separate metric                                                         |
| CmdK first opening is slow                     | Document index/normalization timing, hidden prewarming, unbounded rendered results or synchronous unrelated work                       |
| Escape closes a tooltip instead of a dashboard | Actual focused element and top Radix layer; prefer the creation form's name as initial focus, do not bypass modal ownership            |
| Shortcut appears unresponsive                  | Editing target/modal guard, keybinding capture or an earlier layer still open; inspect focus and `data-state` before adding delays     |
| Device/API-specific color issue                | Native EyeDropper availability, abort/stale-value guards and genuine vertical slider coordinates                                       |
| Native drag previews then snaps back           | Observe real `DataTransfer`, accepted dragover, drop and dragend; preserve the dragged DOM source while projecting its visual position |

Preview identity tests must cover full selected group subtrees, processing ancestors, enabled mask dependencies, source transforms and asset changes. Original image strings do not belong in per-preview JSON keys. Weak asset aliases may reuse genuine string data descriptors without copying bytes; accessor-backed originals require conservative identity checks without invoking their getter.

Keep the real shadcn/Radix controls and keyboard/focus semantics. Add a focused regression for the observed state transition, not a timeout increase or a mock claiming that layout/GPU behavior is correct. Mirror source changes under `apps/web/test/` and retain real browser proof for gestures, focus, scroll and cleanup.

## October 29 layer-scroll investigation

The actual development Chrome session contained a 150-layer AFTERHOURS artboard and
two elements on Composition 2. Its trace and portable document remain local under
`artifacts/layer-scroll-2026-10-29/`. Development JSX/debug-task and tracing overhead
make that capture diagnostic evidence, not a production latency comparison.

Matched production executables and source maps freeze concurrent working-tree
changes. Native runs use Chromium 156.0.8078.4 on Linux, WebGPU reporting Intel
Xe-LPG, one worker and low CPU/I/O priority. The user's 1536 × 754 viewport and
DPR 1.25 are used for the document comparison; existing arrival regressions use
1600 × 1000 and DPR 1. Process scopes cap CPU at 300%, memory at 4500 MiB and
disable scope swapping. Raw reports retain memory-pressure observations.

Forty native 144-pixel scroll reversals previously allocated 140 object URLs and
caused 136–140 image load events. Three matched candidate runs allocate/load zero
replacement images. Median CDP TaskDuration decreases from 599.990 to 293.208 ms
and ScriptDuration from 115.680 to 64.678 ms over that complete prepared workload.
These are aggregate main-thread activity proxies, not INP or physical input latency.
The original long scroll additionally changes the panel commit count by 77; the
isolated virtual tree changes it by zero. Neither version submits optional GPU
work during its delivered continuous wheel burst.

The extended 300-layer arrival check exposed a separate cold scheduling race:
after asynchronous preparation, a canonical thumbnail could compile before newly
queued urgent previews. The first candidate failed at 1116.6 ms in the grouped
suite and 1256.7 ms in a fresh process. A CPU-only diagnostic attributes 800.35 ms
of sampled inclusive time to the compositor, dominated by Three.js TSL graph
construction. Checking urgent priority again at GPU admission allows those rows
to precede the canonical job; its first corrected fresh-process sample is 281.4 ms.
Canonical saving subsequently resumes rather than being discarded.

The existing 24-packet, 420-pixel arrival burst also reproduced 33.4 ms p95 gaps.
Keeping bounded row shells reduces its measured p95 and maximum to 16.8 ms with
zero LongTasks, encodings or GPU submissions. A synchronous React flush experiment
instead produced a 50 ms LongTask and was rejected. A containment experiment also
failed the existing budget and was rejected. Their reports are retained alongside
the successful runs; the budgets and workloads were not weakened.

`layer-stress.spec.ts` expands the workload to 300/100, 1500/300 and 10000/1000
layer/effect pairs across genuine editable AFTERHOURS artboards. Catalogue-wide
settings are deterministic and validated before loading; only the final artboard
is shortened to obtain the exact layer count. Reports record bootstrap separately,
native forward/reverse bursts, end-to-end list jumps, decoded image readiness,
bounded row counts, editor commits and actual readback/submission/encoding hooks.
Keep the final stress results with the exact executable rather than inferring that
the small-scroll results establish performance for every larger document.

For native reordering, `getData()` can be empty during protected dragover even when the MIME type and move operation are legitimate. The actual drop must deliver its payload, complete the canonical command or preference write once, and end with an accepted move. Moving a keyed source through DOM removal/reinsertion can cancel Chromium's native drag even though its visual preview looks correct. Keep canonical DOM order during the held gesture, apply projected positions separately, and retain only the dragged source if it leaves the virtual window. Cancel, stale-origin and no-op cases still restore the canonical view without an undo or persistence write. Use the real browser probe in [native-drag](../../test/browser/support/native-drag.ts); synthetic RTL drops prove transaction logic, not native acceptance.

The large mixed-effect workload initially retained 33 ms frame gaps even with
recycled row shells. Ordinary rows now use plain DOM styles; explicit reordering
alone runs owned Motion Mini springs. This removes per-row Motion React work from
scrolling while retaining interrupted drag offsets and native cancellation.
A full Motion control's deferred stop-style write was caught by the unchanged
native drag tests; the Mini controls commit synchronously and restore `none`.

The first passing production stress run records:

| Layers | Effect instances | AFTERHOURS compositions | Forward p95 | Reverse p95 | Mounted rows |
| --- | --- | --- | --- | --- | --- |
| 300 | 100 | 2 | 16.8 ms | 16.7 ms | 17 |
| 1500 | 300 | 10 | 16.7 ms | 16.7 ms | 17 |
| 10000 | 1000 | 67 | 16.8 ms | 16.7 ms | 17 |

All three cases report zero delivered-burst LongTasks, GPU submissions, native
encodings and production JavaScript pixel readbacks. The 1000 instances vary the
32 available effect types and their declared parameters. Effect density differs
between active artboards; startup times are not comparable as a layer-scaling
claim. The main renderer displays one active artboard while inactive artboards
use the bounded canonical thumbnail service; this is not a claim that 1000 effect
stacks render simultaneously in one active artboard.

Raw generated-input clocks also exposed a 467.9 ms queued first input between
bursts while an optional canonical compilation was already running. Layer-pointer
intent now defers automatic canonical admission until the pointer leaves and its
quiet interval ends. Urgent row previews remain eligible, and an explicit flush
bypasses this hover-only hold while retaining actual gesture guards. Recheck these
raw input clocks separately from delivered-burst frame cadence.

The final frozen production build passes the cold opening regression at 165.2 ms
after wheel dispatch (209.1 ms from the generated input clock). Twelve native
functional/load cases pass, including real drag/cancel/undo, retained focus and
decoded thumbnails, the 50-image/100-effect export/recovery workload, and native
100,000-entry IndexedDB loading with zero cold history reads. The image workload
records a 10,633 ms cold frame and 5,353 ms export; these are functional witnesses,
not claimed startup/export speedups.

The final large-scroll repetition does **not** certify the strict 28 ms frame
budget: forward/reverse p95 values are 33.3/33.3 ms for 300 layers, 33.4/16.8 ms
for 1500, and 16.7/33.2 ms for 10000. Earlier 16.7–16.8 ms cohorts remain archived,
but do not establish a repeatable no-stutter guarantee. All final cases retain
17 mounted rows, unchanged outer editor counters, decoded visible images and
zero burst LongTasks, GPU submissions, encodings or production pixel readbacks.
The previously observed 467.9 ms first queued input is 29.2–30.9 ms in these final
top-jump witnesses. Preserve these failures rather than relaxing their assertions.
