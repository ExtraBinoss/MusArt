# Shared layer drag in Layers and Motion

This implements the user's clarified request: both the left-hand timeline labels and the whole clip bars can change the composition's stacking order. The ordinary Layers panel uses the same controller. Horizontal placement in time remains a separate operation.

| Surface / gesture | Result |
| --- | --- |
| Drag a timeline layer label | Native layer drag, including drops in the Layers panel |
| Drag a clip bar predominantly vertically | Layer stacking or supported hierarchy change |
| Drag a clip bar predominantly horizontally | Existing deterministic track-time movement |
| Drag a trim handle or keyframe | Existing dedicated timing gesture |
| Drag a property label | No layer drag; a drop explains that a layer row is required |
| Escape, blur, pointer cancellation, source disposal | Restore the uncommitted projection and release input resources |

The bar waits for six pixels of movement before choosing an axis. A vertical displacement must exceed the horizontal displacement by 15%; otherwise the gesture locks to time. The decision is kept for that gesture, so moving diagonally later cannot unexpectedly switch tools. Selection happens on pointer-down, before continuous movement. A canceled bar gesture restores its prior selection only while its original document and installed selection still own the interaction.

## Shared responsibilities

| Component | Responsibility |
| --- | --- |
| `layers/drag/controller.ts` | Engine-scoped, input-neutral semantic session, immutable projections, ownership leases and one validated commit |
| `layers/drag/validation.ts` | Existing graph/lock rules and the exact pure-core animated-hierarchy guard |
| `layers/drag/use-layer-drag.ts` | Genuine native HTML drag events and protected DataTransfer handling |
| `layers/drag/presentation.ts` | One current viewport, cached hit geometry, imperative ghost positioning and shared edge scrolling |
| `shared/scroll/drag-auto-scroll.ts` | Bounded velocity, cached viewport geometry and an active-input frame loop |
| `motion/layer-drag/pointer.ts` | Pointer capture, axis recognition and typed timing handoff |
| `motion/layer-drag/use-timeline-layer-drag.ts` | Motion row projection, collapse state and bounded source-retaining windows |
| `motion/layer-drag/TimelineLayerRow.tsx` | Stable row shells, the same position spring as Layers, and contextual drop cues |

The controller has no DOM or React dependency. Native and pointer adapters never manufacture a DataTransfer or retain a React event for later replay. Their shared engine session publishes only a semantic phase, target, rejection or projected order; pixel motion, hover coordinates and velocity do not enter React state.

## Constraints and performance boundaries

- Same-parent ordering is supported for animated layers. Track ranges, keyframes, easing and media settings remain attached to their existing durable layer IDs.
- A hierarchy change that would reinterpret animated parent-local transforms is rejected using the core's existing rule. The cue explains that the layers must remain in their current group. No validation is bypassed.
- Layers from another composition, locked owners, cycles and property-row drops receive a specific explanation. A stale document or page cannot receive an old drop, even when IDs are reused.
- The canonical document is untouched during a preview. A successful drop commits once; a no-op or canceled preview adds no history entry. Deferred task runners recheck the original document immediately before execution.
- Source rows stay mounted and in their original DOM order while the virtual window follows scrolling. Only visual positions move, using the same spring as the ordinary Layers panel.
- Viewport and target rectangles are cached. Container resize and scroll invalidate them; ordinary pixel movements reuse them. A single active viewport drives the ghost and edge scrolling. Its frame loop, observers and listeners stop when the interaction ends.
- This UI operation introduces no GPU pixel readback or per-frame document publication. These design boundaries do not claim a measured 16 ms latency on every device. Native checks and React counters must establish their own declared workload and environment.

## Verification checklist

- [ ] Existing native Layers hook regressions, including inactive pages and deferred commits.
- [ ] Shared controller, owner replacement, graph/lock validation and undo.
- [ ] Same-coordinate foreign-page rejection and container-resize cache invalidation.
- [ ] Whole-bar axis lock, typed timing origin, cancellation and same-ID stale-track rejection.
- [ ] Actual timeline-label to Layers integration with property rows excluded.
- [ ] Native Chromium label drag, whole-bar vertical/horizontal gestures and virtual edge scrolling.
- [ ] Root React commit counters and real readback instrumentation during continuous input.

The exploratory sidebar-only witness was kept under ignored artifacts after the user clarified the requested surface. It is evidence of an existing working interaction, not the regression test for this feature.
