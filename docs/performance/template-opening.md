# Template opening and canvas preparation

## Scope and environment

These are local diagnostic samples, not a latency SLA or a statistically representative cohort. Chromium 156.0.8078.4 on Linux used a 1600 × 1000 viewport, one fresh browser context per opening and native GPU rendering. Vulkan/SwiftShader launch flags were enabled; the physical adapter was not identified. Browser processes and their workers ran at low priority with `CPUQuota=100%`, a 2.2–2.4 GiB memory limit and no swap. The Vite development server was also limited to one CPU. Source changes and new cold module transforms affect these development timings.

The final canvas comparison used a frozen worktree based on `37c02d1`, containing the reviewed template/renderer changes and no concurrent library-card edits. Ignored `artifacts/` retains the source manifest/diff, timing rows, browser witnesses and comparison images. The synchronous comparison replaces only the async atlas entry with the identical synchronous implementation inside the test browser; it does not change production code. An intrusive CPU-sampling experiment timed out and was discarded; its output is not used below.

The measured source predates the parallel replacement of the library reference with the original Melt mascot loop. Its detailed contour/opening numbers describe that archived reference workload; the bounded serialization, source cache and cooperative renderer apply to both templates and saved projects. `artifacts/reference-diagnostic-source.tar` retains the measured authored sources.

## Opening pipeline

A warm hover followed by opening Morphing Type initially took 20,200.8 ms, including 11,000.6 ms for atomic persistence, 1,452.9 ms for save preparation and 6,932.7 ms until the first visible editor frame. This agrees with the observed class of 32-second user openings, without claiming to reproduce that exact environment.

After bounded scalar-array packing, shared validated-source reuse and compaction, a local development sample took 7,947.2 ms: save preparation 1,593.8 ms, persistence 739.5 ms, publication 302.0 ms and first editor frame 5,141.2 ms. The canvas was upgraded from 790 × 480 to 1920 × 1080. Cold editor/GPU preparation is still material; ready is recorded only after its actual matching frame is displayed.

The old encoder emitted 159,948 fragments for the original document, largely because every coordinate pair became a separate task. Small scalar arrays now remain inside the existing bounded message budget; oversized objects can fall back to the original fragmented representation. Cancellation, exact reconstruction, admission limits and atomic persistence remain unchanged. Geometry retains every original timed state while the manifest shrinks by 56.1%.

## Canvas responsiveness

The final comparison below used the same frozen code, warm development server, Full HD document and process limits. It measures animation-frame gaps during preparation after the canvas element mounts, plus native main-thread long tasks. Initial editor-module bootstrap is outside that gap window.

| Measurement                                             | Synchronous atlas | Cooperative atlas |
| ------------------------------------------------------- | ----------------: | ----------------: |
| Opening, browser wall time                              |       10,764.4 ms |        8,822.8 ms |
| Observed animation callbacks in preparation             |                41 |                51 |
| 95th-percentile callback gap within this single opening |          383.3 ms |          183.3 ms |
| Largest callback gap                                    |        1,266.6 ms |          416.7 ms |
| Largest recorded main-thread long task                  |          1,197 ms |            397 ms |

Cooperative alignment and packing reduce the long preparation stalls without changing atlas bytes. Three.js initialization and first shader preparation still produce cold main-thread work. The loading presentation therefore uses a composited orbit, stable mascot framing, a real canvas-owner readiness signal and a short opacity-only exit. It does not add a minimum wait, fabricated progress or a full-canvas blur/clip reveal. Reduced-motion preferences disable the decorative animation.
