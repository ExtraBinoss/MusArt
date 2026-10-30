# Motion UI and project-preference checkpoint

This checkpoint belongs to `feat/motion-video`, after main was integrated at `e2b0312`.
It preserves the original MusArt primary color and the complete request record through M92.

| Domain              | Delivered behavior                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dock                | Complete live header in peek, hover intent, one Pin action, inspector overlay, automatic pin on Static to Motion conversion, and a resize grip hidden until entry settles.                             |
| Keyframe editing    | Shared headless timing draft, collision preflight, live bounded connectors, hidden interpolation glyphs while dragging, exact tooltip/counter time, one committed undo entry and cancellation cleanup. |
| Selection feedback  | Timeline hover outlines evaluated artwork without selecting it; playing decorations remain at 20% opacity and editing targets are inert.                                                               |
| Project preferences | Workspace/sidebar proportions, Motion height and timeline zoom persist independently of documents/history, with field-scoped lazy hydration, deletion guards and atomic field merging.                 |
| Layers and Select   | Appearance stays permanently visible; compact header actions replace the repeated footer, effect submenu hover switches reliably, and bounded Select menus retain scroll controls and shadows.         |
| Assets and theme    | Supplied composition-mode SVGs have larger/thicker strokes; only the bottom timeline scrollbar gets a thinner resting thumb.                                                                           |

## Verification

Focused unit batches passed: 72 core/transport/timeline cases, 53 Layers/Select cases,
63 preference and consumer cases,35 hover/presentation/dock cases, then the affected
5 preference-hook/lifecycle and 20 dock-refactor cases. These batches overlap and
must not be added into a unique-test total. TypeScript, pure-core typechecking,
targeted lint, formatting, synchronized versions and architecture rules are separate checks.

Native Chromium 156.0.8078.4 checks use a single browser worker on Linux with the browser
and the 6110 server each capped at 50% of one CPU core; browser memory is bounded
and swapping disabled. The values below are CLI wall times for functional checks
against Vite, including startup, not interaction latency or a frame-rate benchmark.

| Native scenario                                                                             | Result / wall time |
| ------------------------------------------------------------------------------------------- | ------------------ |
| Peek, Pin, grip timing, unchanged scrollbar lane and toggle glow                            | Passed 34.7 s      |
| Live key drag, links/counter, undo/cancel, hover and playing decorations                    | Passed 37.4 s      |
| Real IndexedDB reload of split sizes, Motion height and zoom                                | Passed 40.9 s      |
| Project B defaults and return to project A preferences                                      | Passed 25.9 s      |
| Dark Layers actions, repeated submenu hover, fixed-height Select and native scroll controls | Passed 41.9 s      |
| Light Layers/Select appearance and scrolling                                                | Passed 34.8 s      |

The key/hover case records zero major editor-root React commits during pointer
movement and zero instrumented production pixel readbacks. The other rendering
checks also preserve their readback assertions. Genuine screenshots and reports
are retained under ignored `artifacts/motion/ui/`.

Preserved failures under `artifacts/motion/perf/` include a real active-toggle blue
shadow, fixed locally; an overlong combined dark/light scenario, split by
responsibility; and a cold light GPU bootstrap that exceeded the default 7-second
assertion under the CPU cap. GPU preparation now uses the same 20-second bootstrap
allowance as the other fixtures; gesture assertions and the 40-second scenario
budget were not increased.

## Newly reported follow-up work

M90 identifies newly mounted canvas selection handles using base geometry while
paused Motion artwork uses its evaluated pose; hit/resize alignment is being fixed
separately. M91 reports rejected native layer dragging and still needs native
attribution. M92 requests stable framing when Pin changes workspace height; the
current workspace-scale compensation needs replacement. These are not claimed
fixed by this checkpoint.

Authored Motion export remains an internal work in progress. Standalone audio
import, camera capture and full In Bloom/Stress Lab performance acceptance are
separate unfinished milestones. These functional checks do not establish the
requested 16 ms performance envelope.
