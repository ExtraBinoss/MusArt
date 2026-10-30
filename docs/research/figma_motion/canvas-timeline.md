# Viewport Canvas timeline

## Authorized scope

The verbatim requests are M131–M134 in [the brief](user-brief.fr.md). The user
authorized implementation of the complete temporal body in Canvas2D, retaining
the HTML label gutter and DOM overlays. This changes presentation; authored
Motion data, deterministic time, engine commands, history and Mediabunny export
keep their contracts.

The sound-bank follow-up remains separate: grouped virtualized items, genuine
bottom-up Canvas mountains and native-clock gray/green progress are documented
in [sound-bank.md](sound-bank.md).

## Evidence and Beam reference

The October 30 13:34 native trace records localhost:6110 and Sound Playground.
Its selected 16,999 ms contains 27 main-thread tasks over 50 ms, totaling 9,906 ms;
the largest lasts 1,346.8 ms. Disjoint self categories attribute 10,310 ms to
script, 1,162 ms to painting, 205 ms to style and 56 ms to layout. Screenshots
show the body empty while its header remains visible. Row views, key markers,
clip/tooltip controllers and Radix remain hot; AudioLibrary is no longer the
dominant component. This is a development/DevTools capture, not a production FPS
measurement. [The performance report](../../performance/motion-timeline.md)
retains the attribution and limitations; raw traces stay in ignored artifacts.

The inspected source is `/home/albi/Documents/Projects/Beam`, commit
`c29043a71b00adef4a158424e2eb375d6343e844`. It was read without changing its
existing working tree. These files establish the useful boundaries:

| Beam implementation | Relevant behavior |
| --- | --- |
| `packages/runtime/src/gpu/gpu-scene-renderer.ts:32` and `gpu-effects-renderer.ts:38` | Runtime scene/effect renderers obtain WebGL2 contexts on OffscreenCanvas, with retained GPU textures and bounded targets |
| `packages/runtime/src/timeline/frame-queue.ts` | One idle-safe queue, measurement before painting, coalesced invalidations |
| `apps/desktop/src/components/editor/timeline/TimelineSurfaceCanvas.vue` | Zero-size sticky frame, one viewport bitmap, native compositor coverage |
| `composables/useTimelineSurface.ts` under that directory | Canvas2D context; viewport repaint on invalidation; playhead independent of static artwork |
| `composables/timeline-range-index.ts` | Temporal intersection queries with stable document ordering |
| `composables/useTimelineVirtualization.ts` | Vertical/horizontal culling, stable membership, retained focused/dragged controls |
| `TimelineCanvasClip.vue` | Transparent HTML semantic controls for native focus, menus and trim |
| `waveform/blick-waveform-renderer.ts` and `waveform/blick-waveform.worker.ts` | Shared worker WebGL2 waveform renderer, Canvas2D `drawImage`, transferred ImageBitmap |

Beam has WebGL2 scene/effect resources in its runtime and a separate Canvas2D
timeline painter. Its worker waveform GPU renderer is another path. This
separation is explicit in the source; copying the temporal UI does not require
replacing MusArt's Three.js artboard renderer. Beam's
historical 10,000-clip update numbers exclude decode, GPU completion and physical
presentation. They guide the design and are not claimed as MusArt measurements.
The inspected calls are explicit: `useTimelineSurface.ts:23` obtains a 2D context;
the waveform renderer obtains WebGL2 at line 30, a target 2D context at line 105,
and calls `drawImage` at line 156; the worker calls `transferToImageBitmap` at
line 18. MusArt reuses its existing audio preparation worker rather than adding
Beam's separate waveform renderer.

## Implementation boundaries

- A pure projection and temporal index produce one scene for painting and hit
  testing. Canvas dimensions follow the visible viewport, never project duration
  or the number of rows. Both vertical and horizontal intersections are bounded.
- A shared measurement/paint queue coalesces invalidations and owns no RAF at
  idle. Playback moves the existing playhead without repainting static artwork.
  Glyph fades and sampled HTML row poses use bounded transient frames.
- During a layer reorder, Canvas follows the actual HTML row animation through
  WAAPI and bounded rectangle observations. It does not run an independent spring
  that could drift from the label pose. A stationary held reorder parks its RAF;
  movement or a new invalidation wakes it again. Build 4 verifies the sampled
  pose and stationary idle behavior below.
- Shared reorder presentation retains accepted insertion intent within a
  six-pixel stationary-pointer hysteresis, before rejecting a property-row hit.
  Movement beyond six pixels, scrolling, leaving the surface, a foreign drag or
  an Alt change revalidates intent. The transient proxy still follows actual row
  geometry; it does not freeze its rectangle to retain an accepted peer.
- Presentation caches follow immutable row/key identities. Key movement merges
  shifted and stationary temporal runs rather than sorting every key on each
  pointer event. Dense markers retain index ranges instead of copying all IDs.
- Tracks, media colors, keys, links, easing glyphs, waveform envelopes and trim
  decorations belong to Canvas. HTML labels retain rename, collapse, selection,
  volume, transition access and the shared layer reorder controller.
- One pointed/focused semantic overlay reuses the existing authoring controls.
  Ordinary clip/key/easing hover publishes Canvas feedback immediately, then admits
  its semantic controller after 64 ms of stable identity. Fast crossings do not
  construct editing subtrees. Pointer-down, context-menu and keyboard intentions
  admit synchronously; audio commands, trim and gap affordances remain immediate.
  Pending admission re-hits the latest pointer and is canceled on leave, scroll,
  gestures, ownership changes and disposal. Hover leases publish their replacement
  before retiring the previous lease, avoiding an intermediate empty decoration.
  Hover, context menus, key clusters, easing, fades, volume, Delete and gesture
  cancellation continue through the same engine commands. A native input that
  precedes hover is delegated to its newly admitted target.
- Gesture ports publish transient timing and marquee ranges imperatively.
  Continuous movement creates no document commands or parent React renders;
  release commits once and cancellation retires the draft.
- Native canvases are bounded before allocation: DPR at most 4, dimension at most
  8,192 pixels and a 16 MiB surface budget. Retired surfaces, observers, frames,
  listeners and waveform requests have explicit cleanup. No production pixel
  readbacks are introduced.
- Visible audio waveforms use the existing preparation worker. Admission is
  finite; a retired consumer cannot terminate another consumer's shared worker
  or install a stale project result. Play suspends new preparation, Pause resumes
  it, and transient cancellation has a bounded retry policy. A same-ID original
  replacement synchronously drops incompatible peaks before the next paint;
  unrelated edits preserve compatible peak references.

## Verified implementation status — October 30, 2026

The initial native build exposed a second 244-pixel gutter in the active DOM
target. Its `.motion-row` grid was still adding the HTML gutter even though the
Canvas root already began after that gutter. The corrected two-class selector,
`.motion-row.motion-canvas-active-overlay`, sets the target grid's first column
to zero and overrides the general row rule. The checks distinguish frozen
**build 2**, **build 4**, the **build 5** handoff/scroll validation and the final
**build 6** direct-control validation.

| Check | Verified result |
| --- | --- |
| Focused implementation tests | **130 distinct focused tests** pass: 113 Canvas base cases, nine shared-presentation cases, five TrackClips cases and three hover-lease ownership cases. The initial 107 tests across 27 mirrored files passed in 16.60 s; the added stationary-held-reorder regression brought that base to 108, with its eight-test recheck passing in 2.80 s. The five TrackClips cases passed in 3.95 s. Rechecks are not counted twice. |
| Source/static checks | Latest scoped TypeScript, including the new native harnesses, reports zero errors. ESLint and type-aware Oxlint report zero violations across all 67 changed TypeScript targets; contribution rules pass. The synchronized version check previously passed at `0.2.0`. |
| Final build 5 scroll coverage | The 1,000-row fixture covered both axes at the first scroll RAF for all five samples, with exact expected bounds, zero instrumented production pixel readbacks and stable tracked editor React roots. |
| Build 2 authoring | Key move, marquee, easing, clip move and trim passed in two native scenarios totaling 17.2 s. These exercise real targets and validated commands. |
| Build 2 playback | Playback passed without repainting static timeline artwork or rendering the tracked editor roots. |
| Build 2 audio controls | Audio right-click fade and volume editing, including one-step undo, passed. Popup retention received a separate later native check below. |
| Build 4 reorder/drop | Both pointer directions and a real HTML `DataTransfer` drop passed, including one-step undo. The probe also captures at CanvasRoot, so a real drop whose propagation stops there remains observable. The `card-x` property proxy follows geometry while the accepted canonical insertion peer stays latched. |
| Build 4 pose/idle and dense clusters | Two native cases passed in 14.7 s. With `no-preference` motion and actual HTML WAAPI parked at 40 ms, the recorded post-paint Canvas poses matched all three HTML labels within 0.25 CSS pixels, including the proxy. Stationary idle caused no paints; Escape cleanup and the dense-cluster case passed. |
| Latest audio popup check | The committed volume popup remains open after the edit and actual `engine.undo()`. The earlier harness focused the ruler to invoke undo, which necessarily dismissed the popup; this check uses the same real engine undo path as the other native audio UI case. |
| Final build 5 context-menu handoff | The 1,000-row and gap/transition cases pass together in 20.5 s. A real right-click on the second occurrence opens the retained transition editor, applies only to that occurrence, and undoes once. The earlier focus-restoration failure is preserved in the build 4 artifacts. |
| Final build 5 original audio | Real WAV import, prepared Canvas waveform, audible native playback, live volume/undo without restarting the mixer, successful journal flush and sound-bank audition/stop pass in 17.5 s. Production WebGPU, WebGL, Canvas2D and VideoFrame read counters remain zero. |
| Real template gallery | In Bloom and Stress Lab opened and passed their native gallery checks in 29.8 s. The real Sound Playground gallery is also the measured Canvas scroll workload below. |
| Final build 6 direct fade controls | A direct click on the visible fade icon opens its real editor, commits a 250 ms fade with one undo and preserves subsequent volume/menu/undo behavior. This strengthened audio case passes in 17.1 s. The earlier pointer promotion into the clip is preserved as a failed build 5 capture. |

Focused regressions also cover synchronous invalidation of stale audio peaks and
recognized volume/mute publications. Native checks now establish the later
pose/drop and popup-retention fixes separately from build 2.

The remaining clip-menu failure exposed a focus-scope handoff race: publishing
the persistent transition editor from item selection could precede Radix's
deferred focus restoration. The source now follows the existing canvas menu
pattern: capture the pending action and generation, then launch from
`onCloseAutoFocus` after validating its origin. It also uses the non-modal menu
and captured context point. Stale-owner regressions and the real build 5 transition handoff pass.

The final gap/transition native check passes. A matched production scroll capture
also completes on build 5; build 6 adds the isolated direct fade-button input fix.
The latter does not change the scroll/painter path. Its separate interaction
capture is recorded separately, with matching executable/maps rather than
relabeling the build 5 measurements.

| Same Sound Playground workload, requested browser/preview/dev quotas 50/45/5 | DOM reference | Canvas build 5 |
| --- | ---: | ---: |
| 20 visual wheel packets, main-thread script | 411.666 ms | 234.919 ms (−42.9%) |
| 12 audio wheel packets, main-thread script | 131.168 ms | 34.262 ms (−73.9%) |
| Visual long tasks | 8 | 2 |
| Visual RAF-gap p95 | 66.7 ms | 50.0 ms |
| Audio RAF-gap p95 | 50.0 ms | 33.4 ms |

The five editor roots and panel counters remain unchanged; production readbacks
and application errors are zero. The visible Canvas is 1,196×283 CSS pixels and
1,353,872 backing bytes at DPR 1. The HTML control itself remains at 66.7 ms RAF
p95 under this constrained producer; audio wall time/dispatch scarcely change,
and its maximum RAF gap worsens to 83.3 ms. This establishes less JavaScript work,
not universal 16 ms presentation. The reference wrapper timeout and its missing
live browser-quota readback are retained in the [performance report](../../performance/motion-timeline.md).

Build 6's interaction capture identified 176.042 ms of script and 18 local React
commit callbacks across eight clip/key crossings, with synchronous overlay
admission sampled directly under `flushSync`. Build 7 addresses this cause while
preserving immediate Canvas feedback. The five native authoring/audio/drop cases
affected by the admission change pass in two serial runs (22.5 s and 18.2 s).
The focused hover comparison is retained separately from the scroll comparison;
no universal 16 ms claim follows from the resource-capped input producer.

## Verification checklist

- [x] Preserve the new requests and inspect the real Beam contexts and boundaries.
- [x] Attribute the new user trace and confirm its missing rows optically.
- [x] Implement the projection, indexes, painter, shared queue and viewport surface.
- [x] Integrate HTML labels and imperative preview ports.
- [x] Pass the first 13 projection/index/queue cases and source TypeScript check.
- [x] Pass the focused Canvas/overlay/gesture/label and shared-presentation unit
      checks: 130 distinct focused tests including the TrackClips handoff and direct fade-button regressions.
- [x] Verify final build 5 native scroll coverage, exact hit coordinates and screenshots.
- [x] Verify build 2 move, trim, marquee, keys, easing and audio editing/undo.
- [x] Verify build 2 playback without static artwork paints or tracked root renders.
- [x] Open In Bloom and Stress Lab through the real gallery.
- [x] Verify the latest pose bridge against actual HTML WAAPI poses and idle.
- [x] Verify dense key clusters and instrumented real DnD drops with undo.
- [x] Verify retained audio volume popups across commit and actual engine undo.
- [x] Verify build 5 clip-menu transition handoff and the final gap scenario.
- [x] Verify final original-backed audio playback, volume continuity and journal flush.
- [x] Verify Sound Playground under the recorded Canvas body/performance workload.
- [x] Profile the recorded scroll executable with matching maps, root commit counters
      and actual read APIs; distinguish preparation from warm interactions.
- [x] Pass the scoped TypeScript, changed-target lint, rules and version checks.
- [x] Complete the final native checks and English changelog entries.
- [x] Complete the separate final direct-control/hover/popover interaction captures.

The verified milestone belongs to `feat/motion-video`; its publication is recorded
in Git rather than inferred from uncommitted working files.

The final build 7 hover traversal paints all eight requested clip/key targets with
zero admitted DOM targets, zero local React commits and zero long tasks. Its
script delta is 50.242 ms, with a 16.8 ms RAF-gap p95 and 33.4 ms maximum. The
five editor roots, panel, labels, document and readback counters remain unchanged.
Cleanup clears the hover and all semantic targets. The build 6 phase placed
cleanup inside its timing boundary; build 7 measures cleanup separately, so no
strict causal percentage is claimed from their total script ratio. Complete
controls and scope limitations are retained in the performance report.
