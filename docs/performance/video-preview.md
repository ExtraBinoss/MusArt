# Five-video preview investigation — 2026-10-30

The original four-original/four-upload-stream admission rejected a fifth concurrent video. The change admits eight streams under shared limits, removes duplicate poster source initialization during playback and provides automatic, configurable session proxies. The production contract and limits are in [interactive video sources](../rendering/video-preview.md).

## Frozen workload and environment

The executable starts from `84d39be`, with only the owned video/proxy/canvas-adapter source changes overlaid. Other workstation changes to effects, animation accordions and editor preferences are excluded. This is a candidate-with-originals versus candidate-with-proxies comparison, not a claim that the unmodified four-stream build could render five clips.

Artifacts are retained under ignored `artifacts/motion/perf/five-video/`: `baseline-src`, `candidate-src`, matching compiled witness/full-app bundles and source maps, `owned-sources.json`, diffs, `media`, `cohort.ts/json/log/png`, `ui-browser` and check logs. The earlier `debug`/`proxy-smoke` runs are exploratory and excluded from the final cohort. The final timing executable predates formatting and deletion of an unused retirement parameter; it contains the same pause/resume, stable playback-source selection and resource policy. Its frozen source and maps are retained separately from subsequent tests/docs. Final source additionally pins the selected proxy object against cache eviction; that case does not occur in this five-small-proxy timing workload and is covered by a focused regression and the final UI build.

Five distinct FFmpeg `testsrc2` clips, hue shifted by identity, each use genuine H.264, 1920×1080, 30 fps and four seconds. Encoding uses libopenh264, 3 Mbit/s, GOP 30, no B frames, two threads. Total originals are about 7.1 MiB. Five independent video layers tile a 1280×720 composition. The headless witness uses the production `StandaloneRenderer`, compositor, sequential cursors and upload fences, with one active render and a latest-only queued request.

Measured environment: Fedora Linux 7.2.8-200.fc44.x86_64, Chromium 156.0.8078.4, viewport 1440×1000, DPR 1. The adapter returned to the renderer reports Intel / xe-lpg, `isFallbackAdapter:false`; the browser does not expose a device description. A single foreground browser cohort runs at nice 15 in a systemd scope with CPUQuota 200%, MemoryHigh 2400M, MemoryMax 3000M and no swap. Other interactive desktop applications remain open; this is a shared workstation observation.

## Results

Three 2.5-second passages per mode alternate originals/proxies/proxies/originals/originals/proxies in the same browser. Preparation is separate: the five ready 960×540 proxies total 2,993,612 bytes and require 6,224 ms wall time. No conversion runs during measured playback. A same-tab minimal RAF control measures median/p95 intervals of 16.7/16.7 ms.

| Boundary                                            |     Five originals |       Five proxies |
| --------------------------------------------------- | -----------------: | -----------------: |
| Completed canvas compositions/s, individual runs    | 19.6 / 21.1 / 25.2 | 57.4 / 56.0 / 56.1 |
| Median of run rates                                 |               21.1 |               56.1 |
| Request media time → completed canvas, median / p95 |    44.9 / 133.9 ms |     13.1 / 33.5 ms |
| Steady accounted decoded bytes                      |        249,600,000 |         62,438,400 |
| Retained upload texture bytes                       |         41,472,000 |         10,368,000 |

These are completed retained-canvas compositions, including same-source-frame reuse, not unique source frames or physical display FPS. Clips are 30 fps. The request-to-completion metric includes browser scheduling and the full canvas boundary; it is not isolated GPU duration, INP or audio latency. The result demonstrates about 2.7× the composition completion rate in this workload, not a universal 60 fps promise.

Actual native probes report peak five main-thread video decoders / 40 frames, and one worker decoder / nine frames. Main-thread frames/decoders and worker frames/decoders return to zero; there are no duplicate frame closes. Pixel read counters are zero for GPU mapped reads, WebGL reads, Canvas2D reads and `VideoFrame.copyTo` in both the production main path and actual conversion worker. The compositor-wide decoded peak remains below its 384 MiB limit.

## Editor and regression checks

`video-proxy-ui.spec.ts` imports all five real originals through the native file input into a Motion page, lets the canvas prepare proxies automatically and presses Play. The captured 1.5-second interval contains 62 distinct acknowledged presentation times. All five live decoder configurations use width 960. Export opens five width-1920 decoders and no width-960 decoder. The portable project remains identical; original export and actual editor screenshots are retained. Main-thread production readbacks and page errors are zero. A second final-build run uses a browser-generated 1080p source imported as five independent assets, verifies unchanged App/Inspector/CanvasArea/EditorCanvas/EditorScene React counters during playback and repeats the original-only export check. Pause-preview decoding is allowed to settle before the export probe; an initial overlapping measurement is retained under `ui-export-overlap` rather than attributed to export. These UI observations are functional evidence, separate from the headless rate comparison.

Focused regressions cover shared decoded admission/release, five-stream playback without duplicate poster sources, original-only exact rendering, profile invalidation, byte/identity bounds, stale/deleted jobs, real conversion errors, pause/resume on the same conversion, activity/drag cleanup and GPU fence retirement. A separate real-worker check (`pause.json`) suspends an actual conversion, holds it for 15 RAF opportunities, resumes the same job ID and obtains a ready proxy with exactly one prepare message. Native conversion retains original duration; the existing sequential/VFR/NTSC tests remain relevant to source timing. Audio playback still uses originals and the earlier [startup buffering contract](audio-playback.md).

Remaining limits: automatic preparation has a real initial cost, cached proxies are session-local, and byte limits can reject long or complex conversions. Unavailable encoders and budget failures retain the original fallback and appear in diagnostic statistics. Neither those fallbacks nor eight-stream admission establish smooth playback for arbitrary files or devices.
