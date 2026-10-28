# Visible thumbnail latency and cold artboard activation

Measured on October 28, 2026 against frozen production builds using the same untraced
browser test on both builds. The workload contains
two editable AFTERHOURS artboards, 150 layers each. A native wheel jumps from the top
to the bottom of the shared layer tree, then returns to the top and bottom. Six
thumbnail cards are actually visible at each destination; overscan rows do not count
as visible results.

| Native wheel dispatch → last visible image ready    |     Before |    After |
| --------------------------------------------------- | ---------: | -------: |
| First jump after opening, without explicit warmup   | 2,566.1 ms | 184.1 ms |
| Previously unseen viewport, retained renderer ready |   799.7 ms | 166.8 ms |
| Return to top, cached previews                      |   133.6 ms |  50.6 ms |
| Return to bottom, cached previews                   |   150.3 ms |  33.4 ms |

These are individual local samples, not universal latency guarantees or INP/GPU
duration claims. Readiness means every actually visible image has `complete` and a
positive `naturalWidth`, verified again on the following RAF. This is a loaded-image
and presentation-opportunity proxy, not certified physical display time. Separate
native decoding tests verify actual pixels. Neither matched test has a sampling floor.
The earlier 799 / 167 ms diagnostic and intermediate 158.9 ms opening cohort remain archived separately. The table reports the final build with Dither minification, thumbnail reveals and completed interaction changes. The 100 ms opacity reveal follows actual image loading; it is not part of image readiness.

The opening variant starts after the first useful main canvas without a save,
canonical flush, top-thumbnail wait or second-page activation. It retains natural
bootstrap work, recorded separately: main-canvas readiness was 1,279.9 / 1,422.6 ms;
input followed readiness by 88.1 / 157.7 ms. This sample does not establish faster application bootstrap. The unseen-viewport variant explicitly
waits for canonical thumbnails first; its renderer and sources may therefore be warm.

The cold bottom sample encoded six real WebP previews and submitted 49 GPU command
batches. Both cached samples performed zero new encodings and GPU submissions. Actual
GPU-buffer, WebGL-pixel and Canvas2D-pixel read hooks remained at zero. App, Inspector,
CanvasArea, EditorCanvas and EditorScene React counters remained unchanged across each
scroll sample. Two GPU contexts serve the editor and its existing shared thumbnail
renderer; thumbnail cards do not create contexts.

A continuous upward scroll delivered 24 native wheel packets of 420 pixels. Both
builds recorded zero long tasks, optional GPU submissions and thumbnail encodings
during the delivered burst. Median frame spacing was 16.7 ms in both; p95 was
16.8 / 16.8 ms. Maximum spacing, including settling, was 16.8 / 16.8 ms. This cohort
establishes faster thumbnail availability, not doubled scrolling FPS. Actual DOM
counters verify unchanged header/compositing/effect controls skip virtual-window
updates while selection, page, attachment and language changes remain live.

Environment: Linux x86_64, headless Chromium 156.0.8078.4, native WebGPU, reported Intel
Xe-LPG adapter, 1600 × 1000 viewport, DPR 1. Browser runs used one worker, low CPU/I/O
priority and a systemd scope with CPUQuota=300%, MemoryHigh=3000M, MemoryMax=4500M and
MemorySwapMax=0. Matching executable JavaScript/source maps, measurements, screenshots
and diagnostic commands are retained in ignored `artifacts/thumbnail-before-dist`,
`artifacts/editor-final-dist`, `artifacts/thumbnail-before-matched-cohort`,
`artifacts/editor-final-cohort`, `artifacts/editor-final-source.json`,
`artifacts/thumbnail-comparison.json` and `artifacts/cold-artboard-flash.json`.
The baseline source is commit `933fa64`; the after build contains this release's
thumbnail, clipboard, canvas, document-space effects and CSS changes. There was no active memory pressure
at the start of either matched cohort.

## Why the change helps

Previously a pointer movement restarted a 600 ms quiet period, even for a visible
layer row. A second shared idle slot waited for each complete render/encode before
admitting the next row, including cached results. Visible requests now outrank
optional canonical/background work after the existing 100 ms wheel quiet barrier.
Held pointers, queued input and hidden documents still defer actual GPU submissions.
Four task-admitted requests keep metadata/cache lookup moving without flooding the
bounded render queue. The retained blob cache holds up to 512 entries under the same
8 MiB byte budget. Rendering, effects and masks still use the same Three.js graph and
retained renderer.

An experimental 32 ms wheel threshold allowed GPU work between native packets and
was rejected; the safe 100 ms boundary remains intact. Two 96-pixel visible previews
instead overlap native encoding while all GPU frames remain serialized on one canvas.
Native `toBlob` snapshots an independent bitmap at call time, so the GPU mutex can
release before encoding finishes. Width/height are captured before reuse, two pending
encoders are bounded and drained on disposal, and other jobs remain serial. The
[HTML canvas algorithm](https://html.spec.whatwg.org/multipage/canvas.html#dom-canvas-toblob)
defines this snapshot behavior. A native correctness test delays callback delivery by
25 ms to exercise differently sized red/blue, effect and mask images; this diagnostic
delay is absent from performance measurements.

The first-page-switch flash had a separate cause: a generic `.canvas-artboard`
checkerboard rule loaded after the same-specificity editor transparency rule. The
white editor host therefore covered the correctly retained destination thumbnail
while its first GPU frame prepared. Explicit compound selectors preserve editor
transparency and the backdrop's own background regardless of import order. The
regression checks the computed production cascade and decodes native screen captures
on an uninstrumented inspection page. Every captured destination sample stays below
the white-flash threshold; a stale GPU frame cannot claim readiness.

## Reproduce

The final renderer change also received a check in the user's existing Chrome
session, rather than an isolated automation profile. On October 28, 2026, this
was Chrome 154 on Linux, Intel Xe-LPG WebGPU, a 1536 × 754 CSS viewport and DPR
1.25. The actual document contained 150 AFTERHOURS layers plus an original
1254 × 1254 image displayed at 778 × 778 on Composition 2. Its stack was Dither
followed by Halftone, both enabled at scale 1. A single-effect calibration alone
would not establish correctness for this document.

After saving and reloading the updated renderer, both the live canvas and the
visible export popover lost the previous large checker/star artifacts. Captures
also compare their identical 147-physical-pixel footprints. A central opaque
91 × 91 screen region had mean absolute RGB difference 5.251/255, without phase
alignment; this is a screen comparison with fractional placement and lossy WebP,
not a claim of pixel identity. Four subsequent artboard switches retained both
works, and Chrome reported no console errors or warnings after the reload.
The original portable document, environment, measurements and captures remain
local in ignored `artifacts/user-real-*`; the user's original asset is not added
to Git. These development-session observations are separate from the frozen
production latency cohorts above.

Follow [the frozen-build protocol](protocol.md), then run serially:

```sh
bunx playwright test test/browser/thumbnail-arrival.spec.ts test/browser/thumbnail-performance.spec.ts test/browser/thumbnail-encoding.spec.ts --config artifacts/performance.config.ts --workers=1 --trace off
```

Reports retain generated-input and dispatch clocks separately. The regression asserts
450 ms cold and 150 ms cached upper bounds, exact destination scrolling, actual
loaded images, zero cached submissions/encodings, unchanged editor React counters
and zero production readbacks. A failed/unsupported backend is a failed or unavailable
cohort, never successful GPU evidence. The same arrival test intentionally fails the
new 450 ms cold budget on the baseline; its raw measurements are written before
assertions. No assertion or workload was weakened.
