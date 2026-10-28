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

For native reordering, `getData()` can be empty during protected dragover even when the MIME type and move operation are legitimate. The actual drop must deliver its payload, complete the canonical command or preference write once, and end with an accepted move. Moving a keyed source through DOM removal/reinsertion can cancel Chromium's native drag even though its visual preview looks correct. Keep canonical DOM order during the held gesture, apply projected positions separately, and retain only the dragged source if it leaves the virtual window. Cancel, stale-origin and no-op cases still restore the canonical view without an undo or persistence write. Use the real browser probe in [native-drag](../../test/browser/support/native-drag.ts); synthetic RTL drops prove transaction logic, not native acceptance.
