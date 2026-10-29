# Interface and layout diagnostics

Use [Protocol](protocol.md) for isolation and clocks, [Canvas](canvas.md) for geometry/presentation, and [Storage](storage.md) for persistent thumbnail/history work. This page covers browser layout and React work around the editor.

## Ownership map

| Responsibility                                    | Source                                                                                                                                                                                                                                         |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared immutable selection analysis               | [layerSelection](../../apps/web/src/components/layers/menu/selection.ts), [sidebar projection](../../apps/web/src/components/workspace/EditorSidebar.tsx)                                                                                      |
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

Attachment editing has its own Provider-scoped open state. Secondary Inspector,
footer and dock presentation retain their last shown model for the complete
effect/mask editing session, then adopt the latest model at deferred priority.
Their subscriptions live in local presentation boundaries: opening a card must
not rebuild the sidebar tabs, resizable panels or layer rows solely because the
editor became active. The engine, attachment ownership and action validation
remain current. Inspector controls whose retained target differs are guarded;
Undo/Redo availability stays live in both the toolbar and pinned commands.

Property selectors use Radix's item-aligned placement with an explicit
`SelectValue` child. This provides the value-node geometry required by Radix
without installing Floating UI overflow-ancestor tracking for every property
list. Options remain lazy until focus/open; closed typeahead, form reset,
keyboard navigation, viewport bounds, menu scrolling and preview cancellation
remain part of the contract. The native witness is
[`effect-select-performance.spec.ts`](../../test/browser/effect-select-performance.spec.ts).
It records input queue delay and dispatch-to-presentation opportunities separately,
checks outer React commits and actual readback APIs, and verifies one commit and
undo of a real Receipt setting. Run it serially with the cold-opening witness;
development diagnostic timings are not production latency claims.

The subsequent [complete effect-control investigation](effect-controls.md)
covers all 32 effects, conditional parameters, portaled row-selection events and
the selected-indicator style flush found in a focused production profile.

The 2026-10-29 frozen Receipt comparison uses Chrome 154.0.8037.97 on Linux,
1600 × 1000 at DPR 1, native Intel Xe-LPG WebGPU, one foreground browser at a
time and a 400% CPU / 3000 MiB memory-high / 4000 MiB memory-max scope without
scope swap. Its 192-pixel photographic source has the full 33-parameter Receipt
definition and a bounded initial parameter window. Before is commit `82e68cb`;
the candidate diff, hashes, bundles, source maps and raw cohorts are retained in
`artifacts/user-profile-20261029/`. Durations below run from native dispatch to
two useful RAFs, including list focus readiness; they are presentation proxies,
not physical display latency or INP.

| Receipt interaction                       | Before       | Candidate    |
| ----------------------------------------- | ------------ | ------------ |
| First popover opening                     | 123.7 ms     | 69.8 ms      |
| Subsequent popover openings               | 58.4–62.2 ms | 51.0–62.6 ms |
| First thermal-halftone list opening       | 108.1 ms     | 95.0 ms      |
| Subsequent thermal-halftone list openings | 96.6–98.4 ms | 45.8–63.4 ms |

The first opening records one Inspector commit before and zero in the candidate;
all list openings retain the four outer editor surfaces, with zero production
pixel readbacks in both cohorts. Warm popover ranges overlap: no consistent warm
popover speedup is established. These are individual observations on a shared
workstation and a focused Receipt fixture, not a distribution or a claim about
every artwork or effect. Separate development observations on port 6100 record
520.8 ms before and 260.0 ms after for the cold popover; do not mix that unscoped
diagnostic pair with the frozen production cohort.

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
| ------ | ---------------- | ----------------------- | ----------- | ----------- | ------------ |
| 300    | 100              | 2                       | 16.8 ms     | 16.7 ms     | 17           |
| 1500   | 300              | 10                      | 16.7 ms     | 16.7 ms     | 17           |
| 10000  | 1000             | 67                      | 16.8 ms     | 16.7 ms     | 17           |

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

## Selection, rulers and attachment opening investigation

The October 29 React exports covered both an effect opening and repeated selection.
The first export included a 415.8 ms commit with App, LayersPanel, Inspector and
MagicSearch work. In the later export, all 44 commits already left App, CanvasArea,
EditorCanvas, EditorScene and MagicSearch untouched. That did not establish fast
selection: urgent commits still took 102–136 ms, including 80–121 ms in LayersPanel;
Inspector updates were a separate 136–175 ms. Attribute the remaining window rather
than assuming that a zero outer-canvas counter proves responsiveness.

| Observed failure                                                         | Required ownership and regression                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A selected row rebuilds closed menus, thumbnails and attachment controls | Keep the selected outline in the row shell, with memoized static contents. Menu/footer availability compares actual gates and resolves the current canonical selection when invoked. Closed guide-preset and effect catalogues are mounted only when opened.                                                                                                  |
| Properties flashes disabled when Ctrl+R toggles rulers                   | Defer actual Inspector document/target changes and retain ruler-equivalent metadata. `updatePage` copies its metadata wrapper while preserving immutable layers/assets. Rulers subscribe independently; metadata reuse must reject actual layer replacement or document loads. A neutral event boundary blocks stale controls while a new context is pending. |
| Rectangle selection appears only on release                              | Publish the current canonical hit set at most once per animation frame during the hold. Flush the final position on release; cancellation restores only the gesture's own selection, with no document history entry.                                                                                                                                          |
| A click release forces layout after selection                            | Reuse the last point for an unchanged click. Release-only movement and changed transform modifiers still require the final coordinates.                                                                                                                                                                                                                       |
| Opening a layer context menu locks or restyles the entire editor         | Use a nonmodal Radix context menu for the tree. Retain focus, keyboard navigation and outside dismissal. A right-button release must not invoke an item; an outside canvas click must both dismiss and select.                                                                                                                                                |
| Several layer popovers remain open                                       | Keep one Jotai slot per editor Provider and per mounted trigger instance. Cancel the previous draft on trigger pointer-down before native blur can commit it. Retired callbacks and delayed close autofocus must not affect the replacement. Normal closing retains the exit animation.                                                                       |
| A large effect stalls while every parameter mounts                       | Mount the visible parameter window (initially 14 rows), pin an active control, and support ordinary scrolling and native Tab navigation across all declared parameters. Keep entrance animations and every parameter.                                                                                                                                         |
| Switching artboards appears delayed                                      | Measure active artboard/selection feedback separately from source preparation and canonical GPU acknowledgment in both directions. Include a real effect-bearing image artboard, rather than inferring switching behavior from rectangle-only selection.                                                                                                      |

The scoped context diagnostic found application work in Radix scroll locking and
focus/position layout. A later Playwright DOM visitor was outside the application
input window and was excluded from attribution. The nonmodal change addresses the
global lock; it does not claim that floating-position layout disappears.

The maintained focused browser witnesses are:

```sh
bunx playwright test test/browser/editor-interaction-latency.spec.ts --config artifacts/performance.config.ts --workers=1
bunx playwright test test/browser/selection-responsiveness.spec.ts --config artifacts/performance.config.ts --workers=1
bunx playwright test test/browser/layer-popover-ownership.spec.ts --config artifacts/performance.config.ts --workers=1
bunx playwright test test/browser/effect-popover-performance.spec.ts --config artifacts/performance.config.ts --workers=1
```

The first uses the real AFTERHOURS artwork plus a second same-sized composition
with two photographic images, each carrying Dither. It checks live held selection,
rulers without a disabled boundary transition, context-menu ownership and native
artboard switching. The selection witness preserves cold text selection separately
from prepared image/shape/layer interactions and Inspector completion. The popover
witness covers Receipt, CRT, Noise, Shatter, Pink Phosphor and Gradient, including
controls beyond the initial window. Record generated-input and dispatch clocks,
outer React commits, actual readbacks and GPU submissions; a passing functional
check alone does not certify a 16.7 ms budget or the user's development session.

A second native trace identifies why a deferred Inspector still delayed selection:
its `fieldset disabled` changed descendant disabled styles and started fourteen
opacity animations. The first replacement used `inert`, which removed the opacity animations but
still propagated computed inert state through the old Inspector. A reason-rich
cold trace resolves 62 of 69 identified style resolutions beneath that boundary.
The final neutral event boundary uses `aria-busy` and capture guards instead,
with canonical command guards retained for portalled and asynchronous edits. The remaining trace explicitly
marks all 613 canvas descendants invalid through the generated AlertDialog
`group-has` title utility while the canvas's own `:has(...:hover)` changes. The
AlertDialog title now uses a scoped media/title sibling rule, and artboard hover
uses its actual heading sibling relationship. Keep relational selectors bounded;
an unused dialog's globally broad selector can penalize an unrelated canvas input.
Do not substitute compositor promotion for a measured style invalidation problem.

The effect-eye baseline separates 88.2 ms to useful UI from a further 27.1 ms to
GPU acknowledgment on the first photograph's warm Dither enable. The sampled
urgent window contains about 48.8 ms of React render work and 13.3 ms of React
commit work, compared with about 5.2 ms inside the engine transaction. Source
textures and node programs are retained, with no new uploads or readbacks in
that sample. These sampled inclusive costs overlap; do not add every source row.
The maintained native eye witness is
[effect-visibility-latency.spec.ts](../../test/browser/effect-visibility-latency.spec.ts).
It checks two Dither photographs and the poster's real Dither stage, exact
single-effect changes, timestamps, one undo entry per toggle and actual GPU
readiness. First-time shader/source preparation must remain separate from warm
visibility toggles and urgent UI feedback.

The layer popup anchor remains stable for one owner across opening and closing.
Changing its virtual reference at open makes Radix install it in a passive effect,
so content initially sees an old zero-sized anchor and positions a second time.
Recycling or unmounting still retires the old measurement lease, while closed
Radix cards perform no automatic geometry reads.

The clean `delivered-production` witness and its earlier
`real-clean-release-fixed` comparison use Chromium 156.0.8078.4 on Linux,
1600 × 1000 at DPR 1, and native Intel Xe-LPG WebGPU. The browser runs serially
in a 400% CPU, 3000 MiB memory-high / 4000 MiB memory-max scope with no scope
swap, at low CPU/I/O priority on a shared workstation. These are individual
observations, not distribution estimates or guarantees for all documents.
The measured boundary below is dispatch to the first animation frame with
useful selection/row state; GPU acknowledgment and Inspector completion remain
separate in the raw reports.

| Interaction                                      | Earlier witness | Delivered witness |
| ------------------------------------------------ | --------------- | ----------------- |
| First AFTERHOURS text selection                  | 101.2 ms        | 43.3 ms           |
| Warm canvas selection                            | 52.7 ms         | 35.8 ms           |
| Layer-list selection                             | 44.9 ms         | 18.7 ms           |
| Outside click selects and dismisses context menu | 54.5 ms         | 30.9 ms           |
| AFTERHOURS to two-photo Dither artboard          | 64.6 ms         | 35.3 ms           |
| Dither artboard back to AFTERHOURS               | 49.8 ms         | 34.0 ms           |
| First photograph's warm Dither enable            | 88.2 ms         | 42.6 ms           |

The eye cohort is `delivered-final` versus `eye-baseline-v2`. Other effects and
directions do not all improve: the poster's disable observation changes from
69.0 to 84.9 ms, with GPU acknowledgment at 284.5 ms. The initial switch to
the photographic artboard still acknowledges its GPU frame at 245.2 ms.
Keep these limits visible rather than describing the whole editor as instant.
The final selection witness also checks both ruler directions (28.0 / 17.9 ms),
held one/two-image hit sets, shrink/reextend and release, with no page errors
or production pixel readbacks. Functional witnesses cover single-owner
attachment handoffs, stale-draft cancellation and undo transactions.

Raw JSON, compiled bundles, source maps and source hashes are retained under
`artifacts/effect-popover/`, with reports in its
`final-verification/artifacts/` subtree. The later `neutral-production` Receipt
cohort retains the failing first-opening observation: 207.1 ms to a presentation
opportunity (123.0 ms to the mount observer), versus 264.6 ms in
`delivered-production`; subsequent openings take 68.8–98.4 ms. Its 150 ms
assertion remains unchanged and failing. Zero outer React commits do not exclude
concurrent render work, native style resolution, layout or focus work.

A subsequent development trace includes React's actual component tracks. It
finds 51.2 ms inside the closed MagicSearch subtree, including 45.3 ms inside
ToolbarContents, despite zero App commits. Dock availability has its own engine
subscription; it must live outside the closed search surface. Static tool buttons
subscribe to their tool, language and binding state in a memoized engine-scoped
group. Dynamic command availability stays live and execution reads the current
canonical snapshot. The same trace identifies an unnecessary 8.3 ms compositing
subtree update caused only by replacing an empty selection array with a different
empty array; use one stable empty selection at that boundary. These development
durations overlap and must not be presented as production savings.

The trace also excludes Inspector rendering from this particular cold opening's
critical path: its component render starts after the first visible popup frame.
Native invalidation tracing inflates the popup's initial layout-tree attachment
because it records a JavaScript stack for every added layout node. A separate
production probe with only the style getter instrumented measures 8.3 ms for the
first Presence animation-name read, rather than the 180–200 ms observed with rich
tracing. Selector matching totals 1.9 ms in that diagnostic, including only
0.08 ms for universal scrollbar selectors. Those selectors are not a demonstrated
cause of the cold-opening delay. Keep untraced latency assertions separate from
diagnostic attribution and check the instrumentation overhead before optimizing
a large diagnostic number.

The native control witness additionally covers reopening before the exit
animation has unmounted its DOM. Each opening generation owns a fresh scroll
viewport, so an old bottom scroll position cannot hide the new parameter window.
The outer Radix content retains normal entrance and exit animation ownership.
Browser-level CDP tracing uses a returned stream and rejects empty or incomplete
captures; a timed-out page-session trace cannot establish component/style costs.

The first complete post-split `final-native` cohort passes Receipt at 136.0 ms
and CRT at 147.4 ms, but still fails the unchanged 150 ms cold-opening budget
for Noise (150.2 ms), Shatter (228.1 ms), Pink Phosphor (185.6 ms) and Gradient
(157.6 ms). All six complete their functional control, scrolling, cancellation
and undo checks before the timing assertions. The context-selection observation
also fails its unchanged 100 ms budget at 114.6 ms. Preserve these failures.

A lightweight Shatter trace subsequently removes the per-node invalidation
instrumentation. It records only 14.3 ms of native style/layout work and one
initial render of each parameter. Remaining sibling work still includes
ToolbarContents (29.9 ms), LayerFooter (26.3 ms) and LayerContext (8.9 ms) in
development. Defer command/footer availability presentation, with memoized
consumers, rather than delaying canonical selection, the popup or its fields.
Action invocation must re-read the canonical state; a retained enabled Duplicate
button must reject a new attachment target, including a queued target handoff.
Development JSX and StrictMode overhead mean these component durations cannot
be presented as equal production savings.

The `priority-native` cohort after that deferral passes eight of ten cases.
Receipt observes its mount at 51.1 ms and a presentation opportunity at 147.1 ms;
Shatter changes from 228.1 to 117.0 ms. The 150-layer mixed selection witness
records 5.3–16.7 ms for warm canvas/layer feedback, 30.2 ms for its first text
selection and 67.9 ms for context selection. The actual AFTERHOURS artwork
records 26.2 ms first text feedback, with Inspector completion separately at
324.7 ms. Warm Dither enable feedback is 19.9–22.6 ms; GPU acknowledgment remains
separate. All functional control, undo, live-marquee, ownership, error and
readback checks pass. Noise at 169.2 ms and Pink Phosphor at 157.4 ms still fail
the unchanged 150 ms cold-opening assertion. These individual observations on a
shared workstation do not establish universal single-frame responsiveness.

A subsequent native development check reproduces a distinct placement defect:
the popup appears at (4, 0) while its current trigger and virtual row reference
have valid bounds. Radix Popper retains a detached fallback trigger button,
because its virtual-anchor effect republishes only when the measurable identity
changes. StrictMode can replay the fallback DOM ref after virtual registration.
Track actual trigger DOM identity with a callback ref and republish the virtual
reference when that node changes, while keeping it stable on ordinary opens.
Observe the same row returned by `getBoundingClientRect` as `contextElement`;
observing only its right-aligned button misses row-width changes on resize.
The native placement regression checks development and production geometry,
scrolling, resize, owner changes and rapid reopening. CSS root zoom is a separate
diagnostic and must not be relabelled as browser zoom.
