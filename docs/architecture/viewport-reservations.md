# Motion panel reservations and canvas framing

The unpinned timeline overlays the workspace. Pinning reserves its final height
once; it does not animate a flex height or scale the workspace and Properties
panel on every frame.

Artboards, headings and their mode controls are positioned relative to the
viewport's center. Changing the viewport height therefore changes their screen
position even when the view's pan and zoom have not changed. Scaling the entire
workspace to conceal that change also distorts the artwork and control geometry.

| Owner                | Responsibility                                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `viewport-resize`    | An engine-scoped imperative port connects the mounted canvas to an explicit layout reservation. Registration tokens prevent stale cleanup from removing a newer owner. |
| `resize-anchor`      | Captures the old viewport center and current view before the reservation. After layout, reads the new rectangle once and compensates pan by `oldCenter - newCenter`.   |
| `ViewMotion.reframe` | Presents the rebased view before paint without clamping its initial screen pose. The view source, picking, selection and rulers keep using the same coordinates.       |
| `MotionTimelineDock` | Captures before Pin/Unpin, applies after layout and preserves the existing body/grip transition ownership. It never applies `scaleY` to the workspace.                 |

If the rebased pose remains within the new pan bounds, the artwork retains its
exact screen position and zoom. If a very large panel or an existing edge pan
places it outside those bounds, a critically damped, position-only spring brings
it into reach. The first frame still presents the old screen pose; intermediate
frames do not snap to the final constraint.

The position driver publishes imperative view updates. React receives one
settled pose, with no repeated outer editor commits during the correction.
The shared spring also drives the timeline body; neither path changes zoom,
stretches controls or reads GPU pixels.

| Interruption                      | Behavior                                                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rapid Pin/Unpin                   | Retires the earlier lease and captures the currently presented pose. Late callbacks cannot affect the replacement.                                        |
| Pointer, wheel or viewport action | Cancels the reservation's correction before the normal input handler runs.                                                                                |
| ResizeObserver                    | Absorbs only the notification matching an active constrained correction. An unrelated viewport resize cancels it and retains ordinary resize constraints. |
| Project/layout change or unmount  | Unregisters the adapter and stops its owned driver.                                                                                                       |
| Reduced motion                    | Applies the valid final pose immediately.                                                                                                                 |

Ordinary window resizing, Fit, Reset, Recenter and wheel zoom keep their existing
behavior. The framing bridge is requested only by explicit Pin/Unpin transitions.
The focused native witness records artwork/selection rectangles, zoom and editor
commit counters on actual animation frames; final panel height alone does not
establish visual continuity.
