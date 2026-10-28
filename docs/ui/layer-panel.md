# Layer panel interaction references

Reviewed on October 27, 2026:

- [Affinity Photo 2: Layers panel](https://affinity.help/photo2/English.lproj/pages/Panels/layersPanel.html) places opacity and blend mode above the layer list. Entries expose thumbnails, visibility and expandable nested content. Adjustments, masks and effects are available from the panel.
- [Affinity Photo 2: Layer masks](https://affinity.help/photo2/English.lproj/pages/Layers/LayerMasks.html) distinguishes pixel and vector masking, attachment to a layer or group, and independent masks. White reveals content, black conceals it, and intermediate values give partial visibility. A grouped masking source can keep editable descendants.
- [Photoshop: Show and hide layers and groups](https://helpx.adobe.com/photoshop/desktop/create-manage-layers/create-layer-compositions/show-and-hide-layers-and-groups.html) shows effects beneath an expanded parent and provides an individual visibility control.
- [Photoshop: Smart Filter masks](https://helpx.adobe.com/photoshop/desktop/effects-filters/smart-filters/mask-smart-filter-effects.html) documents a shared mask for a Smart Filter stack. This should not be confused with independently masking every individual filter.

## MusArt contract

The layer list owns compositing controls, effect and mask entry points. Geometry, paint and typography remain in the property inspector. Attached entries expand below their owning layer; clicking an effect or mask opens its controls in a popover. Large hierarchies use an iterative flattened projection and a bounded visible row window.

The portable model remains authoritative: an ordered effect array and asset/layer mask references are presented as attached rows. Presentation entries do not invent extra document layers, duplicate geometry or silently change the mask's scope. Reordering, visibility and removal use validated engine transactions. Continuous adjustments preview imperatively and commit once.

Previews must come from original resources or actual GPU rendering. Final parent previews must not be labelled as an intermediate effect stage. Background preview queues share retained rendering resources, remain bounded and pause during active gestures. URLs and pending requests have explicit owners.

## Controls and hierarchy

Opacity and the 26-mode blend selector apply to the actual selection, including groups. Empty or inherited-locked selections disable editing. Divergent values show **Mixed** until an absolute value is chosen. A held scrub updates only imperative draft state; one validated command completes the gesture, cancellation restores the source, and a changed project, page, revision or selection rejects a stale gesture.

The heading exposes the overflow menu. Footer icons separately add effects and color adjustments through the shared catalog. Right-click preserves an existing multiselection and exposes one Group/Ungroup item, duplicate, create-mask and counted delete actions. Groups with compositing or attachments cannot be silently flattened by the ungroup action.

Expanding a layer shows its ordered effects, followed by its mask reference and its genuine group children. Effect drag reordering applies only inside its own stack and commits on drop. Mask references display their real linked source name; a source group stays editable in its canonical hierarchy. Popovers expose the current values rather than generating presentation-only document layers.

The visible-row window includes a small overscan. Static rows use stable memoized handlers; Motion layout measurement is enabled only during layer drag projection. Newly selected offscreen rows are revealed without mounting the entire document. Each visible thumbnail owns an abort signal and browser URL. A revision change, exit or unmount releases it, and a late result cannot allocate a replacement URL.

Alignment is implicit: a single root uses its artboard; a single child or sibling selection uses its common group; multiple roots use selection bounds; mixed hierarchies use artboard/world coordinates. Distribution remains available only for three or more siblings. Numeric display rounds to two decimals without rewriting untouched higher-precision document values.

## Verification

Mirrored unit tests cover mixed compositing, immutable previews, single undo, cancellation, stale and deferred edits, effect/mask commands, effect-stack drag, virtual tree projection, ten-thousand-element windows, deep presentation hierarchies, URL ownership and late thumbnail results. `test/browser/layer-controls.spec.ts` exercises the actual hierarchy and context menus; `test/browser/performance-interaction.spec.ts` measures held property/effect gestures through real GPU pixels and editor commit counters. Measurements are reported after the isolated native runs, not inferred from DOM tests.

## Selection work and deferred previews

The layer window caches dimensions from resize/scroll notifications. Revealing an already-visible selected row performs no new layout reads; scrolling an offscreen selection still uses the browser's real scroll position. The application resolves selected IDs through the immutable geometry index instead of filtering every layer.

Visible thumbnail preparation shares one idle callback, runs one job per slot, and waits when fewer than four milliseconds remain or native input is pending. Leaving a viewport cancels an unstarted job and aborts a started request. Foreground export priority remains owned by the platform preview pipeline. No placeholder is described as a completed GPU preview.

The closed spotlight keeps canonical document metadata and normalized search terms prepared. Ordinary selection changes update only the small availability gates and retain the existing catalog objects; result scoring runs while the dialog is open. Closed font pickers use direct named-family labels, requesting installed metadata only when a persisted custom/local ID needs its readable label. The browser-wide metadata cache invalidates on library updates and refreshes when the picker opens.

Offscreen row reveal is coalesced after the initial selected canvas/inspector paint. Superseded project, page or selected-ID scopes cancel that work; actual browser scrolling still reveals the selected row. Color-slider DOM survives canonical target/value updates, while draft reset and pointer ownership prevent an abandoned gesture from editing its replacement target. Scroll-shadow mutation callbacks observe new children without forcing synchronous size reads; ResizeObserver updates the boundary indicators after layout.

Geometry, typography and spacing numeric controls retain their real input/scrub elements when a different immutable target is bound. Rebinding cancels the previous pointer, typed or held-key draft and releases capture; canceled repeated keys stay blocked until release or a fresh non-repeated press. Transform-only commits retain prepared spotlight rows because search metadata depends on page identity/name/dimensions/order and layer identity/name/kind/text/order, rather than geometry or paint.
