# Canvas interaction diagnostics

Read [the shared-artboard contract](../rendering/artboard-workspace.md), [measurement protocol](protocol.md) and [detailed workload definitions](../rendering/performance-protocol.md) before changing canvas behavior.

## Ownership map

| Responsibility                                          | Source                                                                                                                                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pointer capture, drawing, movement and atomic commit    | [EditorCanvas](../../apps/web/src/canvas/EditorCanvas.tsx), [interaction helpers](../../apps/web/src/canvas/interaction/gestures.ts), [drawing](../../apps/web/src/canvas/interaction/drawing.ts)                         |
| Stale gesture scope                                     | [gesture-origin](../../apps/web/src/canvas/interaction/gesture-origin.ts)                                                                                                                                                 |
| Trackpad, hand pan, wheel normalization and zoom motion | [use-viewport](../../apps/web/src/canvas/viewport/use-viewport.ts), [motion](../../apps/web/src/canvas/viewport/motion.ts), [view](../../apps/web/src/canvas/viewport/view.ts)                                            |
| Imperative DOM poses and overlays                       | [use-canvas-presentation](../../apps/web/src/canvas/viewport/use-canvas-presentation.ts), [artboard presentation](../../apps/web/src/canvas/artboards/presentation.ts)                                                    |
| React geometry/selection invalidation                   | [view-state](../../apps/web/src/canvas/session/view-state.ts), [typed geometry equality](../../apps/web/src/canvas/session/geometry-equality.ts)                                                                          |
| Indexed local/world geometry and hit testing            | [LayerGeometryIndex](../../packages/core/src/layers/geometry-index.ts)                                                                                                                                                    |
| Large selection representation                          | [SelectionOverlays](../../apps/web/src/canvas/selection/SelectionOverlays.tsx)                                                                                                                                            |
| Rulers, guides and measurements                         | [guides directory](../../apps/web/src/canvas/guides), especially [ruler-presentation](../../apps/web/src/canvas/guides/ruler-presentation.ts)                                                                             |
| Scene submission and acknowledged revisions             | [SceneController](../../apps/web/src/canvas/session/scene-controller.ts), [canonical presentation port](../../apps/web/src/state/session/canonical-presentation.ts); renderer details belong to [Rendering](rendering.md) |

`packages/core` remains DOM/React/GPU independent. Use validated engine commands for committed document edits; presentation state and transient drafts belong in the web adapter.

## Reproduce the operation

Run the relevant native case against the frozen build/config from [Protocol](protocol.md):

```sh
bunx playwright test test/browser/pan-presentation.spec.ts test/browser/viewport.spec.ts --config artifacts/performance.config.ts --workers=1
bunx playwright test test/browser/selection.spec.ts --config artifacts/performance.config.ts --workers=1
bunx playwright test test/browser/drawing.spec.ts test/browser/guides.spec.ts test/browser/artboards.spec.ts --config artifacts/performance.config.ts --workers=1
```

- AFTERHOURS exercises actual typography, gradients, groups, effects, rulers and guides.
- The 50-image fixture exercises decoding, cached originals and GPU effects; it is not 50 unique original photographs.
- The 10,000-element fixture exercises indexed picking, select-all, a real distinct move of every layer, one commit and undo. Point-selection success alone does not prove that the release path is fast.
- Drawing checks a true text rectangle, live preview without outer editor React commits, stale/canceled drafts and one undo. Click defaults remain distinct from a dragged frame.

Keep wheel/hand presentation, anchored zoom, actual layer dragging and committed release as separate intervals. For a slow release, compare the canonical renderer acknowledgment and the later journal/save work rather than treating an observer callback as a displayed frame.

Include immediate follow-up wheel/hand input after a large commit, before flushing its background journal or autosave. A canonical draw can complete quickly while later metadata work still blocks the next gesture. Attribute those windows separately from steady-state pan and preserve the failing follow-up workload until the relevant storage/scheduling fix is verified.

## Required invariants

- Ordinary wheel input pans both axes. Ctrl/Cmd+wheel zooms around the pointer; normalized delta modes, spike limits, reset/fit/recenter and reduced-motion behavior remain intact.
- Pure pan changes retained CSS/compositor poses. It must not recreate the R3F canvas/context, reprepare sources, submit the document composition or publish editor React frames continuously.
- Property/drawing/move previews are imperative. The canonical document stays unchanged until commit; cancellation restores it and a completed gesture creates one undo entry.
- Replacing the project/page/revision cancels old gestures. Escape and pointer loss release owned captures; historical playback cannot start edits.
- Page/ruler guides remain visible and editable in collective selection mode. Above 64 selected layers, per-layer detail handles are bounded, but full selection, metadata and bulk commands remain intact.
- Exact nested/rotated/group/mask geometry must remain correct. Mask-source subtrees do not intercept canvas picking, but remain editable through Layers.

Pointer selection accepts Shift, Ctrl or Cmd clicks to add/remove the hit layer.
Dragging the right mouse button starts a crossing marquee even on painted artwork;
release selects editable, visible layers whose world bounds intersect the box. Holding
Shift/Ctrl/Cmd adds those hits to the captured selection. Left-drag on blank space
retains containment selection. A stationary right click and canceled right marquee
preserve selection, and selection changes never create document undo entries.
Both marquees retain one DOM box and update its bounds imperatively, without publishing
React or GPU preview frames on pointer movement. Pointer cancellation, capture loss,
Escape and stale page/project/revision scopes discard the draft and release capture.
These mouse gestures remain separate from the editable keyboard command registry.

## Failure triage

| Symptom                                 | Inspect first                                                                                              |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Smooth RAF cadence but delayed input    | Generated vs dispatch timestamps, same-cohort control, browser coalescing and main-thread queueing         |
| Zero GPU work yet costly pan            | Style/layout/paint and DOM mutations, not just the compositor's submission counter                         |
| Huge style subtree invalidation         | Repeated text/attribute mutations and Blink selector reasons, especially `:has()`                          |
| Slow select-all or large frame          | Repeated map/set construction, per-layer bounds allocation, ancestor scans and full document serialization |
| Drag preview duplicated on release      | Transient patches still present during canonical publication                                               |
| Text sharp before resize but soft later | Untransformed R3F measurement, zoom/DPR density, settled quality updates and retained source reuse         |
| Wrong page edited after a gesture       | Origin capture and page-local/world transforms across active-artboard changes                              |
| Old or never-acknowledged canvas        | Scene revision/source preparation errors, superseded targets and presentation-port lifecycle               |

A verified regression came from assigning the same zoom label's `textContent` on every pan. The replacement triggered shadcn/Tailwind `:has()` invalidation across 615 canvas descendants. Preserving the same text node reduced those passes to four elements; the diagnostic trace showed no layout work. Retained ruler ticks also move inside clipped HTML compositor strips: moving an SVG ancestor still invalidated its subtree and was not an adequate fix.

For collective root bounds, aggregate scalar x/y/width/height directly and allocate one union; use canonical world-bounds fallback for nested or rotated layers. Avoid materializing 10,000 frozen boxes merely to compute a rectangle. Cache only proven immutable inputs; mutable drafts must not donate stale indices.

Use the exact mirrored tests under `apps/web/test/canvas/` and `packages/core/test/layers/`. Targeted unit runs, types and lint belong outside a HARD timing window. Keep screenshots, raw probes and profiler maps in the cohort archive; do not replace a visual failure with a mock-only test.
