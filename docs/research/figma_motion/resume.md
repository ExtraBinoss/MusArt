# Resume Motion work after the next explicit “go”

The previous checkpoint stopped gracefully at the user's request on 2026-10-30.
The later explicit “ok continue, ... envoie sous agent ... (commit ... + push)”
resumed implementation. The historical checkpoint below is preserved as evidence;
see the implementation log and subsequent commits for the resumed work.

## Workspace and checkpoints

- Work only in `/home/albi/Documents/Projects/Hackaton/MuseArtWeb-motion`, branch `feat/motion-video`.
- Preserve `/home/albi/Documents/Projects/Hackaton/MuseArtWeb`, its work and port 6100.
- Last fully checked/pushed UI milestone: `88675a9`. Main performance fixes were merged at `e2b0312`.
- The commit containing this handoff is an explicitly unfinished WIP checkpoint, not a release.
- All agents are stopped. No native test worker remains. The owned 6110 Vite service is stopped for the night.

## Completed before this checkpoint

The published baseline includes the generic headless Motion engine, deterministic
time, video layers, per-artboard timelines, keys/easing, virtualized rows,
In Bloom/Stress Lab templates, simplified Timelapse export, compact Layers menus,
project-scoped panel sizes/zoom and the complete request/research record.

The newer canvas/Pin fixes have focused unit and real Chromium evidence:

| Scenario                                                                                              | Latest result |
| ----------------------------------------------------------------------------------------------------- | ------------- |
| Evaluated image selection, animated parent matrix, resize commits230 while base180 stays intact, undo | Passed 28.5 s |
| Picking during Play without editing/pausing, faint inert handle s                                     | Passed 26.4 s |
| Pin/unpin keeps artwork and selection pixels stable on every sampled frame                            | Passed 26.8 s |
| Large pinned panel corrects pan limits smoothly without stretching or zooming                         | Passed 27.9 s |

These are CLI wall times including browser/bootstrap under CPU caps, not frame
latency. Root unit batches: typed timeline input/snap/gestures14 passed; canvas
pose/pick34 passed, authoring16 passed, hover7 passed; Pin26 passed plus4 affected
viewport cases. Batches overlap. Native reports/screenshots remain in ignored
`artifacts/motion/selection/` and `artifacts/motion/ui/`.

## Current WIP and first checks tomorrow

1. Finish the shared layer drag integration before adding more export UI.
   `components/layers/drag/` now owns an engine-scoped input-neutral controller,
   canonical validation, presentation and leases. Timeline gutter uses the same
   native adapter; clip bars lock vertical reorder versus horizontal retiming.
   Shared edge scrolling lives in `shared/scroll/drag-auto-scroll.ts`.
2. **One canonical z-order:** Layers and Motion are projections of the same layer
   tree/order. Vertical dragging updates both views, composition and export.
   Horizontal clip movement changes timing only. Property rows do not create
   independent stacking order. Preserve parent/group compositing semantics.
3. Latest drag run was 26/28 passing. The two legacy hook failures are fixed but
   not rerun. New presentation/pointer/row/hook/Panel and native drag cases exist
   but have not run. No final typecheck/lint/format has run for the full WIP.
4. Apply the two prepared drag guards: synchronously reject a visual whose base
   no longer matches canonical layers; initialize the floating ghost position
   before its first paint. See `layer-drag.md` and the audit notes below.
5. Fix two outstanding typed gesture issues in `motion/gestures.ts`: sample the
   final pointerup coordinates/modifiers before committing; restore selection on
   cancellation only while the gesture still owns its installed selection.
   The file is exactly 600lines: extract a real origin/ownership helper rather
   than exceeding the limit. Add focused release-only and selection-change tests.
6. Investigate, without speculative fixes: edge-loop restart after content grows,
   stationary intent during temporary group expansion, selection after invalid
   drops. Already addressed in code but awaiting tests: cross-page cached targets,
   row-rect resize invalidation and stale track identities.
7. Adaptive handle CSS and shared two-tone fallback are applied. Single selection
   plus unselected hover is capped at 9 backdrop filters; multi-selection/Play use
   zero filters. Hover on an already selected item is suppressed. **Optical proof
   has not run.** Execute `selection-handle-contrast.spec.ts`; do not claim adaptive
   black/white correctness until its real-canvas PNG checks pass.
8. Run focused checks serially, one worker, low priority and bounded resources.
   Start with `use-layer-drag.test.ts` and `presentation.test.ts`, then the new
   pointer/row/hook/Panel/shared-scroll tests. Run the three focused native drag
   scenarios in `motion-layer-drag.spec.ts`, then the two optical scenarios.
9. Run affected strict TypeScript, lint, formatting, rules and version checks;
   fix findings, commit verified follow-ups and push without rewriting history.
   No full coverage/build/load gate is needed for each local iteration.

## Next confirmed product work

| Work                    | Requirement s                                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Composition export      | Use Exporter. An optional action in the artboard's… menu opens the same panel. Keep Timelapse distinct.                                                                                                                                    |
| Artboard selection      | Genuine select with artboard names, scrollbar/controls and ScrollShadow; store durable IDs, default to the active artboard.                                                                                                                |
| Static/Motion detection | Inspect the chosen artboard's actual mode. Static exports the base design; Motion uses authored timing and original media.                                                                                                                 |
| Export preview          | Real-time Motion preview in the export panel where feasible, using the existing engine/render graph, bounded work and no editor/history mutation. This does not reinstate canceled global hover-play.                                      |
| Mediabunny              | Required exporter. Verify its actual API/capabilities and document precise defaults and parameter order: dimensions, rational FPS/duration, container/codecs, quality/bitrate and audio settings. Never fake support or successful output. |
| Standalone audio        | Add import and nonvisual timed tracks, mute/volume/trimming, and cached Instagram-style vertical-bar waveforms. Existing video source audio is not standalone audio import.                                                                |
| SFX library             | Categorized searchable/selectable sounds including whooshes. Evaluate CINETIC TypeScript/WebAudio generation or a verified CC0 bank; preserve provenance and deterministic rendering.                                                      |
| Transition s            | A categorized catalog of 30 GPU transitions, generic/headless timing and the same Three.js/TSL preview/export graph. No production GPU pixel readbacks.                                                                                    |

Existing export WIP is in `packages/render/src/export/motion/`, including the
`audio/` mixer/resampler/source. It has lifecycle work, but authored export UI and
native encoded-output verification remain incomplete. Before applying CINETIC,
read `/home/albi/.agents/skills/cinetic/SKILL.md` and announce its use.

Resolve transition scope early tomorrow: layer entry/exit, between clips or
between compositions. Also distinguish 30 catalog presets from 30 distinct operators
before claiming completion. Camera/live remains a later phase. Standalone audio,
SFX demos, Motion template cover images and the final In Bloom/Stress Lab 16 ms
performance acceptance are unfinished. Earlier diagnostic profiling does not
establish that final performance gate.

## Cancellations and constraints

The preference-button restyle, text-clearing animation change and global
motion-on-hover request were explicitly canceled. Do not implement them.
Keep MusArt primary blue, genuine shadcn/Radix controls, English/French resources,
English docs, generic core/render boundaries, one undo per gesture and explicit
resource cleanup. No production readPixels/map/getImageData/VideoFrame.copyTo.

## Restart the owned dev server

The stopped service was transient. Recreate it in the Motion worktree:

```sh
systemd-run --user --collect --unit=musart-motion-dev-6110 --working-directory=/home/albi/Documents/Projects/Hackaton/MuseArtWeb-motion -p CPUQuota=100% -p MemoryHigh=1280M -p MemoryMax=1400M -p MemorySwapMax=0 -p Nice=19 -p IOSchedulingClass=idle --setenv=NODE_OPTIONS=--max-old-space-size=1024 /home/albi/.nvm/versions/node/v24.19.0/bin/node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 6110 --strictPort
```

Use spaced flags `--host 127.0.0.1 --port 6110` when executing the command above.
The ignored `artifacts/motion/run-native.py` and
`artifacts/motion/reduced-ui.playwright.config.ts` already exist in this worktree:
one scenario per service, browser 50% + server 50% CPU, memory bounds, runtime 55 s,
test 40 s and cleanup restoring the server quota. Existing oversized combined
scenarios were split; retain their failures under `artifacts/motion/perf/`.
