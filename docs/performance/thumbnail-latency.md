# Visible thumbnail latency and cold artboard activation

Measured on October 29, 2026 against frozen production builds using the same
untraced browser test. The final v7 candidate includes all eleven new effects,
the generic authored-reference renderer and the coalesced preview-presentation
barrier. Both baseline and candidate were measured again after the overnight
pause; every boundary runs in a fresh browser process. An expected baseline
assertion failure cannot give one build a colder browser than the other.

The workload contains two editable AFTERHOURS artboards, 150 layers each. A
native wheel jumps from the top to the bottom of the shared layer tree, then
returns to the top and bottom. Six thumbnail cards are actually visible at each
destination; overscan rows do not count as visible results.

| Native wheel dispatch → last visible image ready    |     Before | Final v7 |
| --------------------------------------------------- | ---------: | -------: |
| First jump after opening, without explicit warmup   | 2,099.7 ms | 153.0 ms |
| Previously unseen viewport, retained renderer ready |   799.6 ms | 150.2 ms |
| Return to top, cached previews                      |   133.5 ms |  33.7 ms |
| Return to bottom, cached previews                   |   133.4 ms |  33.6 ms |

These individual local samples establish faster image availability after event
dispatch: 13.7× for the first jump and 5.3× for the prepared unseen viewport.
They are not universal latency guarantees, INP or GPU-duration measurements.
Readiness means every actually visible image has `complete` and positive
`naturalWidth`, verified again on the following RAF. The 100 ms opacity reveal
follows loading; it is not part of image readiness. Native decoding tests verify
actual pixels. Neither matched test has an artificial sampling floor.

## Include input queueing

The opening sample retains the delay **before dispatch** as well as the
application capture clock. Both timestamps are required:

| Opening boundary                            |     Before | Final v7 |
| ------------------------------------------- | ---------: | -------: |
| Generated wheel → application dispatch      |    23.9 ms |  41.4 ms |
| Generated wheel → last visible image ready  | 2,123.6 ms | 194.4 ms |
| First useful main canvas after fixture load | 1,285.9 ms | 994.6 ms |
| First useful canvas → wheel dispatch        |   228.0 ms |  77.6 ms |

Including browser queueing, the first jump improves by **10.9×**, rather than the
post-dispatch 13.7×. The 153.0 ms value must not be presented as end-to-end input
latency. The candidate verifies the same ready destination on the next frame at
169.2 ms after dispatch. The test adds no save, canonical flush, top-thumbnail
wait, page activation or explicit pause before this input. Natural bootstrap
work remains in the sample. These single samples do not establish a general
bootstrap improvement or attribute input queueing to a particular subsystem.

For the prepared unseen viewport, generated input → ready is 824.1 → 190.4 ms;
generated → dispatch is 24.5 → 40.2 ms. Cached top/bottom readiness including
queueing is 159.3/162.5 → 61.6/63.6 ms. The prepared boundary explicitly waits
for canonical thumbnails, so its renderer and sources may be warm.

## Work and scrolling

The prepared cold bottom sample encodes six real WebP previews. GPU command
batches are 49 before and 61 after; the authored-reference/mip path does more
GPU work while removing scheduling delays. Both cached samples do zero new
encodings and GPU submissions. Actual GPU-buffer, WebGL-pixel and Canvas2D-pixel
read hooks remain at zero. App, Inspector, CanvasArea, EditorCanvas and
EditorScene React counters are unchanged across each scroll sample. Cards do
not create a context per thumbnail.

A continuous upward scroll delivers 24 native wheel packets of 420 pixels.
Both builds record zero long tasks, optional GPU submissions and encodings during
the delivered burst, with 17 virtual rows mounted. Frame spacing p95 is
16.8 ms before and 16.7 ms after. This establishes faster thumbnail availability,
not increased scrolling FPS. Actual DOM counters separately verify stable
header/compositing/effect controls skip virtual-window updates while selection,
page, attachment and language changes remain live.

Environment: Linux x86_64, headless Chromium 156.0.8078.4, native WebGPU reporting
Intel Xe-LPG, 1600 × 1000 CSS viewport, DPR 1. Browser runs use one worker, low
CPU/I/O priority and CPUQuota 300%, MemoryHigh 3000 MiB, MemoryMax 4500 MiB,
MemorySwapMax 0. Every timed launch records memory PSI avg10 and avg60 at zero;
the raw scopes retain all averages and memory snapshots. The build's earlier
transient memory-pressure event is retained separately and was followed by a
quiet interval before any native or timed run. Exact compiled files/maps,
source provenance, commands and raw generated/dispatch clocks are retained in
ignored `artifacts/effects-final-cohorts/v7/`, with separate `baseline/` and
`candidate/` reports. Baseline executable source is `933fa64`; candidate source
is the archived `75e9116` working tree plus the recorded changes, not merely the
checkpoint commit. Its executable is preserved under
`artifacts/effects-final-cohort-v7-dist/`; its HTTP index SHA-256 is
`bd450e869491837c51ad3a2fcb611e2b2550c52e67390a0554e3cd8d1ccf8556`.

## Preserve failed boundaries

The previous v6 opening failed the unchanged 450 ms bound at **612.0 ms after
dispatch**, or 645.9 ms including queueing. Four images were ready at 140.1 ms;
no RAF followed until 612.0 ms. That failure remains intact under
`artifacts/effects-final-cohorts/v6/`.

A separate profiled v6 diagnostic measured 411.6 ms and reproduced the mechanism
with a shorter gap: all six native 96-pixel encode callbacks finished by
147.3 ms, then a genuine 261 ms LongTask blocked presentation. Matching source
maps attribute 238.9 ms of sampled wall time to the canonical compositor,
including 202.1 ms of Three.js TSL graph construction; these inclusive stages
overlap. Nine pipeline creations and 74 submissions occurred during that task,
ending with the 432 × 768 canonical snapshot. This diagnostic is not a headline
latency sample, nor an exact attribution of every millisecond of the original
612 ms failure. It is preserved in `artifacts/opening-diagnostic/`.

V7 lets resolved urgent images commit and receive a browser paint opportunity
before admitting optional canonical compilation. One delivery fence coalesces
all consumers and cache hits; a changed delivery generation waits for another
complete opportunity. It does not hold GPU admission slots or postpone the next
urgent preview. Abort, stale validation, hidden pages and disposal retain their
cleanup paths. The compilation work still exists; its priority changes so it
cannot hide already delivered images behind that initial long task.

The earlier v6 full native suite also recorded a separate first cold text
selection at **108.4 ms**, exceeding its unchanged 100 ms budget. Analysis of
only that pointerdown-to-presentation window found about 75 ms in synchronous
React work, 27.6 ms of unattributed browser/program intervals and unchanged main
GPU counters. Three predeclared fresh-process v6 repetitions then passed at
38.5, 37.5 and 62.8 ms. The original failure and all repetitions are preserved;
they are not thumbnail measurements or evidence that cold-selection outliers
cannot recur. See `artifacts/images50-cold-v6-analysis/` and
`artifacts/effects-final-cohorts/v6/images50-cold-repeats/`.

Older 184.1/166.8/50.6/33.4 ms samples predate the eleven-effect integration.
V2's 142.5 ms opening excluded 435.0 ms before dispatch; v3's opening was
427.4/456.1 ms after dispatch/including queueing. All remain historical evidence,
not substitutes for the final v7 matched samples above.

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

The earlier renderer correction also received a check in the user's existing Chrome
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

A read-only follow-up in that existing Chrome session on October 29 (Europe/Paris)
confirmed the active canvas still acknowledged a WebGPU frame, both inactive
artboard images were decoded at 432 × 768, and no alert was displayed. It did
not edit the document or stand in for the frozen native effect comparisons.

Follow [the frozen-build protocol](protocol.md). For each build, run the opening
and prepared boundaries as separate fresh processes, preserving this order:

```sh
bunx playwright test test/browser/thumbnail-arrival.spec.ts --config artifacts/performance.config.ts --workers=1 --trace off --grep "first layer-list jump immediately"
bunx playwright test test/browser/thumbnail-arrival.spec.ts --config artifacts/performance.config.ts --workers=1 --trace off --grep "visible thumbnails arrive promptly"
```

The broader regression suite can also run serially below. Its grouped execution
is not the process isolation used for the measured cold boundaries:

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
