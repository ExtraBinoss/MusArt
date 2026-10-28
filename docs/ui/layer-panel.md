# Layer panel interaction references

Reviewed on October 27, 2026:

- [Affinity Photo 2: Layers panel](https://affinity.help/photo2/English.lproj/pages/Panels/layersPanel.html) places opacity and blend mode above the layer list. Entries expose thumbnails, visibility and expandable nested content. Adjustments, masks and effects are available from the panel.
- [Affinity Photo 2: Layer masks](https://affinity.help/photo2/English.lproj/pages/Layers/LayerMasks.html) distinguishes pixel and vector masking, attachment to a layer or group, and independent masks. White reveals content, black conceals it, and intermediate values give partial visibility. A grouped masking source can keep editable descendants.
- [Photoshop: Show and hide layers and groups](https://helpx.adobe.com/photoshop/desktop/create-manage-layers/create-layer-compositions/show-and-hide-layers-and-groups.html) shows effects beneath an expanded parent and provides an individual visibility control.
- [Photoshop: Smart Filter masks](https://helpx.adobe.com/photoshop/desktop/effects-filters/smart-filters/mask-smart-filter-effects.html) documents a shared mask for a Smart Filter stack. This should not be confused with independently masking every individual filter.

## MusArt contract

The layer list owns compositing controls, effect and mask entry points. Geometry, paint and typography remain in the property inspector. Attached entries expand below their owning layer; clicking an effect or mask opens its controls in a popover. Large hierarchies use an iterative flattened projection and a bounded visible row window.

The list is a project tree: every artboard is a collapsible root, followed by its own canonical layers and attachments. All roots share one virtual viewport. Activating or adding an artboard preserves that viewport and its native scroll position; selecting an inactive layer activates its artboard through the existing engine page port. Background previews name their target page explicitly and never activate an artboard just to render it. Layer drags remain scoped to their captured artboard; a different artboard is not an implicit cross-page move command.

Dragging onto a target layer's thumbnail creates an editable GPU layer mask, following the [current Affinity Photo 2 masking reference](https://affinity.help/photo2/fr.lproj/pages/Layers/LayerMasks.html). The thumbnail hit region includes a small horizontal tolerance while retaining insertion at row edges. Dropping elsewhere inserts above/below or inside a group; Alt remains an optional mask shortcut. Shape/vector clipping uses alpha coverage, so a blue rectangle clips as fully as an opaque white rectangle. Luminance remains an explicit mask mode for white-reveals/black-conceals raster workflows. The mask source remains canonical editable content, not a rasterized replacement.

The accepted insertion/mask cue is translated and portaled above scroll clipping and Motion stacking contexts. Native drag sources remain mounted in canonical DOM order while only their displayed positions change. Hover changes no document state; a valid completed drop commits one command, an identical existing attachment creates no undo entry, and stale/locked/cyclic targets remain rejected. Mask controls expose inversion, enable/disable, mode and removal, with direct navigation to an editable linked source. A genuine isolated mask view requires a renderer presentation mode; document visibility edits or CSS previews must not impersonate it.

The portable model remains authoritative: an ordered effect array and asset/layer mask references are presented as attached rows. Presentation entries do not invent extra document layers, duplicate geometry or silently change the mask's scope. Reordering, visibility and removal use validated engine transactions. Continuous adjustments preview imperatively and commit once.

Previews must come from original resources or actual GPU rendering. Final parent previews must not be labelled as an intermediate effect stage. Background preview queues share retained rendering resources, remain bounded and pause during active gestures. URLs and pending requests have explicit owners.

## Controls and hierarchy

Effect and mask targets are presentation state, independent of portable layer IDs. Clicking a card or attached child keeps the owner as the canonical engine layer selection while recording the exact attachment separately. Delete captures that target before a deferred task or command-dialog close and validates it again; it never falls back to the owner. Successful attachment deletion clears layer intent, so a repeated Delete cannot accidentally remove the parent. Inputs inside an attachment editor retain native text editing.

Collapsed rows show at most two real effect-stage preview cards and one real mask preview card. A remaining-count button exposes the existing full child list; the selected effect is surfaced among the two previews. Cards overlap inside the unchanged 36-pixel row and use page-scoped bounded preview leases, without mounting a thumbnail observer for every effect in a long stack.

Opacity and the 26-mode blend selector apply to the actual selection, including groups. Empty or inherited-locked selections disable editing. Divergent values show **Mixed** until an absolute value is chosen. A held scrub updates only imperative draft state; one validated command completes the gesture, cancellation restores the source, and a changed project, page, revision or selection rejects a stale gesture.

The heading exposes the overflow menu. Footer icons separately add effects and color adjustments through the shared catalog. Right-click preserves an existing multiselection and exposes one Group/Ungroup item, duplicate, create-mask and counted delete actions. Groups with compositing or attachments cannot be silently flattened by the ungroup action.

Expanding a layer shows its ordered effects, followed by its mask reference and its genuine group children. Effect drag reordering applies only inside its own stack and commits on drop. Mask references display their real linked source name; a source group stays editable in its canonical hierarchy. Popovers expose the current values rather than generating presentation-only document layers.

The visible-row window includes a small overscan and advances in five-row batches. Native scroll metrics update immediately; movement inside the existing window performs no React state update. Static rows use stable memoized handlers; Motion layout measurement is enabled only during layer drag projection. Newly selected offscreen rows are revealed without mounting the entire document. Each visible thumbnail owns an abort signal and browser URL. An appearance change, exit or unmount releases it, and a late result cannot allocate a replacement URL.

Alignment is implicit: a single root uses its artboard; a single child or sibling selection uses its common group; multiple roots use selection bounds; mixed hierarchies use artboard/world coordinates. Distribution remains available only for three or more siblings. Numeric display rounds to two decimals without rewriting untouched higher-precision document values.

## Verification

Mirrored unit tests cover mixed compositing, immutable previews, single undo, cancellation, stale and deferred edits, effect/mask commands, effect-stack drag, virtual tree projection, ten-thousand-element windows, deep presentation hierarchies, URL ownership and late thumbnail results. `test/browser/layer-controls.spec.ts` exercises the actual hierarchy and context menus; `test/browser/performance-interaction.spec.ts` measures held property/effect gestures through real GPU pixels and editor commit counters. Measurements are reported after the isolated native runs, not inferred from DOM tests.

`test/browser/project-layers.spec.ts` adds native protected-mode DataTransfer acceptance, the floating thumbnail-drop cue, decoded alpha-clipping output, one undo and shared-project-tree viewport checks. These scenarios must run against a frozen build before reporting their results; authoring a test is not evidence that the native case passed.

## Selection work and deferred previews

The layer window caches dimensions from resize/scroll notifications. Revealing an already-visible selected row performs no new layout reads; scrolling an offscreen selection still uses the browser's real scroll position. The application resolves selected IDs through the immutable geometry index instead of filtering every layer.

Visible thumbnail preparation shares one idle callback, runs one job per slot, and waits when fewer than four milliseconds remain or native input is pending. Leaving a viewport cancels an unstarted job and aborts a started request. Foreground export priority remains owned by the platform preview pipeline. No placeholder is described as a completed GPU preview.

The closed spotlight retains static command labels and shortcuts, updating only the availability needed by dock controls. It does not build document rows, normalize search terms or score results. Opening prepares the document catalog lazily; subsequent openings reuse it while its labels and ordering remain current. Project snapshots are held weakly so a closed search cannot retain removed original assets. App, layer menus, compositing controls and command availability share one immutable selection analysis; mutable inputs remain uncached. Closed font pickers use direct named-family labels, requesting installed metadata only when a persisted custom/local ID needs its readable label. The browser-wide metadata cache invalidates on library updates and refreshes when the picker opens.

Offscreen row reveal is coalesced after the initial selected canvas/inspector paint. Superseded project, page or selected-ID scopes cancel that work; actual browser scrolling still reveals the selected row. Color-slider DOM survives canonical target/value updates, while draft reset and pointer ownership prevent an abandoned gesture from editing its replacement target. Scroll-shadow mutation callbacks observe new children without forcing synchronous size reads; ResizeObserver updates the boundary indicators after layout.

Geometry, typography and spacing numeric controls retain their real input/scrub elements when a different immutable target is bound. Rebinding cancels the previous pointer, typed or held-key draft and releases capture; canceled repeated keys stay blocked until release or a fresh non-repeated press. Transform-only commits retain prepared spotlight rows because search metadata depends on page identity/name/dimensions/order and layer identity/name/kind/text/order, rather than geometry or paint.

## Thumbnail dependency scope

Layer preview identities follow the same selected graph as portable image exports: the selected subtree, its processing ancestors, complete enabled mask sources and their processing paths. Paint, effects, transforms, mask configuration, working color space and referenced originals participate. Unrelated layers, names, locking and guide/spacing metadata do not invalidate a completed preview. The platform uses this same dependency check before accepting an asynchronous result, so an unrelated edit cannot cancel an otherwise current request.

Paint interning retains at most 1,024 signatures within 1 MiB. Original-image contents are not serialized into keys or retained in strong alias tables; bounded weak candidates recognize equivalent asset-object clones. Mutable values are rechecked, and opaque accessor-backed assets never donate cross-object aliases. Deeply immutable layer paint and immutable ID order can use weak caches. The UI retains unchanged preview URLs, cancels replayed StrictMode idle work and revokes each owned URL on replacement or unmount.

## Targeted stabilization checks — October 28, 2026

In the frozen production build, a local headless Chromium session at 1600 × 1000 and DPR 1 scrolled the 150-layer AFTERHOURS fixture through twelve native wheel inputs (420 pixels). The traced diagnostic retained 17 layer rows, committed the Layers panel twice and recorded no App, Inspector, CanvasArea or EditorCanvas commits. Its frame gaps had a 16.7 ms median and p95, with one 33.4 ms maximum and no long tasks. A separate untraced functional run recorded a 16.7 ms median and a 16.8 ms p95/maximum. These measurements cover this interaction and fixture; they do not establish a universal result for every document or scene.

The traced input window contained 14 style updates totaling 8.6 ms. CPU samples concentrated in native DOM removal during a virtual-window change rather than document traversal, rendering or preview preparation. Raw profiles, Blink invalidation traces and browser-clock windows remain under ignored `artifacts/layer-scroll-production*`.

A six-layer native fixture observed one new 96-pixel browser encoding and one preview request after editing one layer; the other five preview URLs remained unchanged. A project rename produced no new layer preview requests. Repeated solid/gradient saturation, hue, alpha and hexadecimal edits, including switching targets during a held gesture, produced no maximum-depth or cleanup errors in the tested development/StrictMode and production paths. The previously reported intermittent maximum-depth error was not reproduced by these scenarios; its exact original trigger remains unconfirmed.
