# Layer panel interaction references

Reviewed on October 27, 2026:

- [Affinity Photo 2: Layers panel](https://affinity.help/photo2/English.lproj/pages/Panels/layersPanel.html) places opacity and blend mode above the layer list. Entries expose thumbnails, visibility and expandable nested content. Adjustments, masks and effects are available from the panel.
- [Affinity Photo 2: Layer masks](https://affinity.help/photo2/English.lproj/pages/Layers/LayerMasks.html) distinguishes pixel and vector masking, attachment to a layer or group, and independent masks. White reveals content, black conceals it, and intermediate values give partial visibility. A grouped masking source can keep editable descendants.
- [Photoshop: Show and hide layers and groups](https://helpx.adobe.com/photoshop/desktop/create-manage-layers/create-layer-compositions/show-and-hide-layers-and-groups.html) shows effects beneath an expanded parent and provides an individual visibility control.
- [Photoshop: Smart Filter masks](https://helpx.adobe.com/photoshop/desktop/effects-filters/smart-filters/mask-smart-filter-effects.html) documents a shared mask for a Smart Filter stack. This should not be confused with independently masking every individual filter.

## MusArt contract

The layer list owns compositing controls, effect and mask entry points. Geometry, paint and typography remain in the property inspector. Attached entries expand below their owning layer; clicking an effect or mask opens its controls in a popover. Large hierarchies use an iterative flattened projection and a bounded visible row window.

### Project tree and artboards

| Panel topic       | Behavior                                                                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Artboard roots    | The list is a project tree: every artboard is a collapsible root, followed by its own canonical layers and attachments.                                                            |
| Viewport          | All roots share one virtual viewport.                                                                                                                                              |
| Activation        | Activating or adding an artboard preserves that viewport and its native scroll position; selecting an inactive layer activates its artboard through the existing engine page port. |
| Preview targeting | Background previews name their target page explicitly and never activate an artboard just to render it.                                                                            |
| Drag scope        | Layer drags remain scoped to their captured artboard; a different artboard is not an implicit cross-page move command.                                                             |

### Effect controls

| Panel topic            | Behavior                                                                                                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Available controls     | Effect popovers expose the renderer's actual controls through the typed catalogue: enabled state, opacity, blend mode, optional alpha composition and all applicable effect parameters. |
| Seed controls          | Dither and Grain include their deterministic seeds;                                                                                                                                     |
| Gradient               | Gradient exposes its complete style/treatment settings and shows colored output and levels only for treatments which consume those values.                                              |
| Validated ranges       | Pixel scales and quantization use the full validated ranges.                                                                                                                            |
| Fine displacement      | Fine chromatic displacement is displayed in per mille so the shared numeric field can edit thousandth-unit document values precisely.                                                   |
| Control dimensions     | Effect rows, opacity and blend controls share a 30-pixel height and 6-pixel row gaps.                                                                                                   |
| Scrolling              | Long popovers use one bounded scroll viewport, constrained by Radix's available space and the browser viewport.                                                                         |
| Preview and commit     | Their previews remain imperative and completed gestures still commit once.                                                                                                              |
| Reset                  | The icon at the top resets all authored parameters and compositing defaults in one undoable command, preserving effect identity and enabled state.                                      |
| Draft cancellation     | It cancels live and typed drafts first.                                                                                                                                                 |
| Reset feedback         | Numeric labels and effect-color labels use the same replayable reset feedback; resetting an unchanged value adds no history.                                                            |
| Color-picker ownership | One effect owns one open color picker; switching colors cancels the previous uncommitted draft.                                                                                         |

Closed select fields display their selected label without constructing hidden option
trees. Options mount on focus or opening and remain available for closed keyboard
typeahead. Long effect panels mount a bounded window of controls inside their
normal scroll area. Scrolling and Tab/Shift+Tab reach every parameter without
an additional button; the active control stays mounted while a draft is held.

Overlay autofocus keeps normal keyboard focus and accessible button names without
opening tooltip labels. Tooltips appear on deliberate pointer hover; merely opening
an effect, mask, export or color popover does not request them. Static labels close
when the pointer leaves their trigger; the provider's explicit hoverable-content
option remains available for a future interactive tooltip.

### Masks and drag/drop

| Panel topic          | Behavior                                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Thumbnail drop       | Dragging onto a target layer's thumbnail creates an editable GPU layer mask, following the [current Affinity Photo 2 masking reference](https://affinity.help/photo2/fr.lproj/pages/Layers/LayerMasks.html). |
| Hit region           | The thumbnail hit region includes a small horizontal tolerance while retaining insertion at row edges.                                                                                                       |
| Other drop targets   | Dropping elsewhere inserts above/below or inside a group; Alt remains an optional mask shortcut.                                                                                                             |
| Alpha clipping       | Shape/vector clipping uses alpha coverage, so a blue rectangle clips as fully as an opaque white rectangle.                                                                                                  |
| Luminance mode       | Luminance remains an explicit mask mode for white-reveals/black-conceals raster workflows.                                                                                                                   |
| Editable source      | The mask source remains canonical editable content, not a rasterized replacement.                                                                                                                            |
| Floating cue         | The accepted insertion/mask cue is translated and portaled above scroll clipping and Motion stacking contexts.                                                                                               |
| Retained drag source | Native drag sources remain mounted in canonical DOM order while only their displayed positions change.                                                                                                       |
| Commit and rejection | Hover changes no document state; a valid completed drop commits one command, an identical existing attachment creates no undo entry, and stale/locked/cyclic targets remain rejected.                        |
| Mask controls        | Mask controls expose inversion, enable/disable, mode and removal, with direct navigation to an editable linked source.                                                                                       |
| Isolated mask view   | A genuine isolated mask view requires a renderer presentation mode; document visibility edits or CSS previews must not impersonate it.                                                                       |

The portable model remains authoritative: an ordered effect array and asset/layer mask references are presented as attached rows. Presentation entries do not invent extra document layers, duplicate geometry or silently change the mask's scope. Reordering, visibility and removal use validated engine transactions. Continuous adjustments preview imperatively and commit once.

Previews must come from original resources or actual GPU rendering. Final parent previews must not be labelled as an intermediate effect stage. Background preview queues share retained rendering resources, remain bounded and pause during active gestures. URLs and pending requests have explicit owners.

## Controls and hierarchy

### Attachment selection

| Panel topic          | Behavior                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Presentation target  | Effect and mask targets are presentation state, independent of portable layer IDs.                                                                                  |
| Canonical selection  | Clicking a card or attached child keeps the owner as the canonical engine layer selection while recording the exact attachment separately.                          |
| Deferred Delete      | Delete captures that target before a deferred task or command-dialog close and validates it again; it never falls back to the owner.                                |
| Repeated Delete      | Successful attachment deletion clears layer intent, so a repeated Delete cannot accidentally remove the parent.                                                     |
| Text editing         | Inputs inside an attachment editor retain native text editing.                                                                                                      |
| Collapsed previews   | Collapsed rows show at most two real effect-stage preview cards and one real mask preview card.                                                                     |
| Remaining effects    | A remaining-count button exposes the existing full child list; the selected effect is surfaced among the two previews.                                              |
| Row and lease bounds | Cards overlap inside the unchanged 36-pixel row and use page-scoped bounded preview leases, without mounting a thumbnail observer for every effect in a long stack. |

### Selection controls

| Panel topic       | Behavior                                                                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Compositing scope | Opacity and the 26-mode blend selector apply to the actual selection, including groups.                                                                                                                      |
| Disabled editing  | Empty or inherited-locked selections disable editing.                                                                                                                                                        |
| Mixed values      | Divergent values show **Mixed** until an absolute value is chosen.                                                                                                                                           |
| Gesture lifecycle | A held scrub updates only imperative draft state; one validated command completes the gesture, cancellation restores the source, and a changed project, page, revision or selection rejects a stale gesture. |
| Tree indicator    | Locked layers retain a visible lock indicator in the tree.                                                                                                                                                   |
| Inherited locks   | Inherited protection names the blocking ancestor.                                                                                                                                                            |
| Canvas inspection | Pointer selection can inspect locked artwork on the canvas, where a dashed frame and constant-screen-size lock badge replace editing handles; selection never begins a move.                                 |
| Locked controls   | The property inspector and effect/mask popovers show a translated locked notice and an Unlock action.                                                                                                        |
| Unlock            | Unlock clears only the actual blocking chain in one validated transaction, preserving independent sibling and descendant locks.                                                                              |
| Stale actions     | Deferred actions reject a changed project, page, revision or selection.                                                                                                                                      |

The heading exposes the overflow menu. Footer icons separately add effects and color adjustments through the shared catalog. Right-click preserves an existing multiselection and exposes one Group/Ungroup item, duplicate, create-mask and counted delete actions. Groups with compositing or attachments cannot be silently flattened by the ungroup action.

Expanding a layer shows its ordered effects, followed by its mask reference and its genuine group children. Effect drag reordering applies only inside its own stack and commits on drop. Mask references display their real linked source name; a source group stays editable in its canonical hierarchy. Popovers expose the current values rather than generating presentation-only document layers.

### Virtual rows and resource ownership

| Panel topic         | Behavior                                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Window size         | The visible-row window includes a small overscan and advances in five-row batches.                                |
| Scroll publication  | Native scroll metrics update immediately; movement inside the existing window performs no React state update.     |
| Stable controls     | Static rows use stable memoized handlers; Motion layout measurement is enabled only during layer drag projection. |
| Selection reveal    | Newly selected offscreen rows are revealed without mounting the entire document.                                  |
| Thumbnail ownership | Each visible thumbnail owns an abort signal and browser URL.                                                      |
| Cleanup             | An appearance change, exit or unmount releases it, and a late result cannot allocate a replacement URL.           |

Alignment is implicit: a single root uses its artboard; a single child or sibling selection uses its common group; multiple roots use selection bounds; mixed hierarchies use artboard/world coordinates. Distribution remains available only for three or more siblings. Numeric display rounds to two decimals without rewriting untouched higher-precision document values.

## Verification

Mirrored unit tests cover mixed compositing, immutable previews, single undo, cancellation, stale and deferred edits, effect/mask commands, effect-stack drag, virtual tree projection, ten-thousand-element windows, deep presentation hierarchies, URL ownership and late thumbnail results. `test/browser/layer-controls.spec.ts` exercises the actual hierarchy and context menus; `test/browser/performance-interaction.spec.ts` measures held property/effect gestures through real GPU pixels and editor commit counters. Measurements are reported after the isolated native runs, not inferred from DOM tests.

`test/browser/project-layers.spec.ts` adds native protected-mode DataTransfer acceptance, the floating thumbnail-drop cue, decoded alpha-clipping output, one undo and shared-project-tree viewport checks. These scenarios must run against a frozen build before reporting their results; authoring a test is not evidence that the native case passed.

## Selection work and deferred previews

The layer window caches dimensions from resize/scroll notifications. Revealing an already-visible selected row performs no new layout reads; scrolling an offscreen selection still uses the browser's real scroll position. The application resolves selected IDs through the immutable geometry index instead of filtering every layer.

| Panel topic           | Behavior                                                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visibility observer   | Mounted thumbnail cards share one lazy visibility observer with generation and subscription-time guards.                                                                                                                              |
| Request admission     | Visible thumbnail preparation shares one user-visible task with at most four owned requests, allowing cached rows to complete without waiting behind a cold render or another idle callback.                                          |
| Cancellation          | Leaving a viewport cancels an unstarted job and aborts a started request.                                                                                                                                                             |
| GPU scheduling        | The platform preview pipeline serializes actual GPU work and pauses it during held pointers, live wheel bursts and queued native input.                                                                                               |
| Resume and priorities | Visible rows resume 100 ms after the final wheel packet, bypassing the separate 600 ms background quiet period; canvas, layer-list and explicit-export work retain the same safety boundary; explicit export retains higher priority. |
| Blob cache            | The blob LRU retains up to 512 results within the existing 8 MiB budget.                                                                                                                                                              |
| Readiness             | No placeholder is described as a completed GPU preview.                                                                                                                                                                               |

### Deferred catalogs

| Panel topic          | Behavior                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Closed search        | The closed spotlight retains static command labels and shortcuts, updating only the availability needed by dock controls.                         |
| Document preparation | It does not build document rows, normalize search terms or score results.                                                                         |
| Reopening            | Opening prepares the document catalog lazily; subsequent openings reuse it while its labels and ordering remain current.                          |
| Snapshot lifetime    | Project snapshots are held weakly so a closed search cannot retain removed original assets.                                                       |
| Selection analysis   | App, layer menus, compositing controls and command availability share one immutable selection analysis; mutable inputs remain uncached.           |
| Closed font picker   | Closed font pickers use direct named-family labels, requesting installed metadata only when a persisted custom/local ID needs its readable label. |
| Font metadata cache  | The browser-wide metadata cache invalidates on library updates and refreshes when the picker opens.                                               |

### Selection updates and retained controls

| Panel topic                    | Behavior                                                                                                                                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reveal scheduling              | Offscreen row reveal is coalesced after the initial selected canvas/inspector paint.                                                                                                                 |
| Superseded scopes              | Superseded project, page or selected-ID scopes cancel that work; actual browser scrolling still reveals the selected row.                                                                            |
| Color controls                 | Color-slider DOM survives canonical target/value updates, while draft reset and pointer ownership prevent an abandoned gesture from editing its replacement target.                                  |
| Scroll shadows                 | Scroll-shadow mutation callbacks observe new children without forcing synchronous size reads; ResizeObserver updates the boundary indicators after layout.                                           |
| Retained inputs                | Geometry, typography and spacing numeric controls retain their real input/scrub elements when a different immutable target is bound.                                                                 |
| Rebinding and key cancellation | Rebinding cancels the previous pointer, typed or held-key draft and releases capture; canceled repeated keys stay blocked until release or a fresh non-repeated press.                               |
| Search invalidation            | Transform-only commits retain prepared spotlight rows because search metadata depends on page identity/name/dimensions/order and layer identity/name/kind/text/order, rather than geometry or paint. |

## Thumbnail dependency scope

| Panel topic         | Behavior                                                                                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency graph    | Layer preview identities follow the same selected graph as portable image exports: the selected subtree, its processing ancestors, complete enabled mask sources and their processing paths. |
| Paint inputs        | Paint, effects, transforms, mask configuration, working color space and referenced originals participate.                                                                                    |
| Ignored metadata    | Unrelated layers, names, locking and guide/spacing metadata do not invalidate a completed preview.                                                                                           |
| Result acceptance   | The platform uses this same dependency check before accepting an asynchronous result, so an unrelated edit cannot cancel an otherwise current request.                                       |
| Paint cache bound   | Paint interning retains at most 1,024 signatures within 1 MiB.                                                                                                                               |
| Original identities | Original-image contents are not serialized into keys or retained in strong alias tables; bounded weak candidates recognize equivalent asset-object clones.                                   |
| Mutable values      | Mutable values are rechecked, and opaque accessor-backed assets never donate cross-object aliases.                                                                                           |
| Weak caches         | Deeply immutable layer paint and immutable ID order can use weak caches.                                                                                                                     |
| URL ownership       | The UI retains unchanged preview URLs, cancels replayed StrictMode idle work and revokes each owned URL on replacement or unmount.                                                           |

## Targeted stabilization checks — October 28, 2026

| Panel topic              | Behavior                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Environment and workload | In the frozen production build, a local headless Chromium session at 1600 × 1000 and DPR 1 scrolled the 150-layer AFTERHOURS fixture through twelve native wheel inputs (420 pixels). |
| React and row counts     | The traced diagnostic retained 17 layer rows, committed the Layers panel twice and recorded no App, Inspector, CanvasArea or EditorCanvas commits.                                    |
| Traced frame gaps        | Its frame gaps had a 16.7 ms median and p95, with one 33.4 ms maximum and no long tasks.                                                                                              |
| Untraced frame gaps      | A separate untraced functional run recorded a 16.7 ms median and a 16.8 ms p95/maximum.                                                                                               |
| Measurement boundary     | These measurements cover this interaction and fixture; they do not establish a universal result for every document or scene.                                                          |

The traced input window contained 14 style updates totaling 8.6 ms. CPU samples concentrated in native DOM removal during a virtual-window change rather than document traversal, rendering or preview preparation. Raw profiles, Blink invalidation traces and browser-clock windows remain under ignored `artifacts/layer-scroll-production*`.

### Stable controls and tree motion

| Panel topic                  | Behavior                                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Memoization inputs           | The heading menu, compositing controls and effect/adjustment buttons are memoized on their actual engine, page, selection and action inputs.                                         |
| Virtual scrolling            | Advancing the virtual row window does not rebuild these unchanged controls.                                                                                                          |
| Live subscriptions           | Their own attachment and translation subscriptions remain live, and page/selection/handler changes still rebind controls and cancel stale drafts.                                    |
| Empty selection              | Attachment-disabled compositing uses one private frozen empty selection rather than allocating a new array during every scroll update.                                               |
| Commit counters              | In automation mode the existing DOM roots/buttons expose actual React commit counters, alongside the unchanged panel and canvas counters, so native checks can verify this boundary. |
| Expansion                    | Chevron toggles animate the bounded mounted row window through Motion.                                                                                                               |
| Exit interaction             | Exiting rows remain inert for the short transition; expansion never mounts an entire large group.                                                                                    |
| Animation updates            | Positions, opacity and row/window height animate without React updates per frame.                                                                                                    |
| Scroll and drag interruption | Ordinary virtual scrolling and native drag start cancel these animations immediately; stable keys preserve real row identity and the drag source.                                    |
| Reduced motion and fallback  | Reduced motion and platforms without native element animation use immediate projection.                                                                                              |
| Chevron identity             | One chevron glyph rotates instead of being replaced.                                                                                                                                 |
| Cursor and cleanup           | Rows use the default arrow cursor, with grabbing reserved for the active native drag source and removed by normal drop/cancellation cleanup.                                         |

Native drag feedback snapshots only the real decoded thumbnail (or its truthful type
icon) and layer name on a transparent surface. It excludes row backgrounds, attachment
cards and action buttons so drop targets remain visible. The original source stays in
place, thumbnail reveal animations are disabled in the snapshot, and the drag owner
removes the temporary node on every completion, cancellation or disposal path.
The native drag image contains only the existing decoded thumbnail and layer name on
a transparent background. A pending image uses the faithful layer-kind icon. The
feedback DOM is separate from the retained source row and is explicitly removed on
drop, cancellation, invalidation or unmount; it never includes row controls or attachments.

### Targeted preview and color checks

| Panel topic                  | Behavior                                                                                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preview invalidation         | A six-layer native fixture observed one new 96-pixel browser encoding and one preview request after editing one layer; the other five preview URLs remained unchanged.                                                          |
| Project rename               | A project rename produced no new layer preview requests.                                                                                                                                                                        |
| Color-control scenarios      | Repeated solid/gradient saturation, hue, alpha and hexadecimal edits, including switching targets during a held gesture, produced no maximum-depth or cleanup errors in the tested development/StrictMode and production paths. |
| Unconfirmed original trigger | The previously reported intermittent maximum-depth error was not reproduced by these scenarios; its exact original trigger remains unconfirmed.                                                                                 |
