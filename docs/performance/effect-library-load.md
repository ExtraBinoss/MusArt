# Eleven-effect photographic load verification

## Frozen workload

| Context               | Recorded evidence                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Candidate and fixture | The final frozen v7 production candidate was tested on October 29, 2026 with 50 image layers, 100 effects, five transformed groups and ten masks in a 2400 × 1500 composition. |
| Effect stack          | The first effect cycles through all eleven new types; the second is the existing Contrast effect.                                                                              |
| Photo corpus          | The corpus contains 50 files derived from ten photographs, with **43 distinct JPEG SHA-256 fingerprints**, plus one SVG mask.                                                  |
| Corpus limitation     | It is not a corpus of 50 unrelated photographs.                                                                                                                                |
| Original sizes        | Encoded originals total 13,732,474 bytes; declared decoded RGBA totals 245,760,000 bytes.                                                                                      |

### Result boundary

| Context               | Recorded evidence                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Executed duration     | The native test passed in 23.7 seconds (24.3 seconds including runner overhead).                                             |
| Archived v3           | The earlier v3 run remains archived; its duration is not a measurement of v7.                                                |
| Coverage boundary     | Fresh whole-suite coverage is tracked separately from this functional witness.                                               |
| Timing interpretation | This is a functional workload duration, not thumbnail latency, GPU duration or a before/after speed claim.                   |
| PNG inspection        | The resulting full-resolution PNG was inspected: all fifty photos retain recognizable content and their intended treatments. |
| Treatment witness     | Each image region differs from its corresponding first-effect-zero rendering.                                                |

## Measured behavior

| Observation                                        | Result                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------- |
| Main renderer cache                                | 292,094,880 bytes / 402,653,184-byte budget                               |
| Main renderer targets                              | 241, unchanged during parameter preview                                   |
| Source uploads                                     | 97, unchanged during parameter preview                                    |
| Initial-document GPU contexts before reload        | 3                                                                         |
| Production GPU / WebGL / Canvas2D pixel reads      | 0 / 0 / 0, actual APIs instrumented                                       |
| Major editor React commits during held Ripple drag | 0 for all five monitored roots                                            |
| Canonical Ripple drag commit                       | One revision; one undo restores the original                              |
| Small-radius handle at 46% zoom                    | Exact center hit; center changes, protected radius stays 12               |
| Transparent export                                 | Corner alpha 0, translucent photo 217, opaque photo 255; 256 alpha levels |
| Canonical WebP                                     | 768 × 480; 71,426 bytes                                                   |
| Worst photo-region WebP/reference RGB mean error   | 7.898 / 255, below the unchanged 10-byte bound                            |
| Durable reload                                     | All 50 original SHA-256 values and complete effect stacks restored        |
| Idle / recovery                                    | No pending renderer work; decoded restored artwork verified               |

### Resource and inspection boundaries

| Context           | Recorded evidence                                                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Context ownership | The initial document records three contexts across the existing editor/export/ thumbnail surfaces; individual effect instances do not allocate a context.  |
| Context lifetime  | This counter is sampled before recovery navigation and resets in the new document, so it is not a cumulative context count across both document lifetimes. |
| Memory accounting | Context counts and the main-renderer cache are different resource boundaries and should not be added together as a total GPU-memory measurement.           |
| PNG decoding      | Native PNG decoding happens on a separate uninstrumented inspection page, outside production readback accounting.                                          |

### Gizmo failure and correction

| Context                  | Recorded evidence                                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Failed overlap           | The first attempt exposed overlapping six-CSS-pixel gizmo handles: a protected radius of 12 document pixels is only 5.5 CSS pixels at fit zoom.           |
| Original hit target      | Painting order therefore selected the inner radius at the center point.                                                                                   |
| Correction               | The shared gizmo now chooses the nearest visible screen-space handle, prioritizes the center on exact ties, and retains keyboard access to every handle.  |
| Successful assertions    | The successful witness asserts `elementFromPoint`, the real native center change, the single canonical revision, undo and actual GPU preview pixels.      |
| Protected radius         | Its archived before/after effect record also confirms that the protected radius stays 12.                                                                 |
| Preserved failure record | The failure log remains archived; its original screenshot was inspected but was subsequently removed when a fixed Playwright output directory was reused. |
| Capture retention        | Later failures and baseline captures use unique retained output directories.                                                                              |
| Unchanged assertions     | The center/commit/undo assertions were not relaxed.                                                                                                       |

## Match the viewport history

| Context                    | Recorded evidence                                                                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original mismatch          | The first v3 resource assertion caught different cache histories rather than an unbounded allocation.                                                                                   |
| Initial fit                | The initial useful frame went directly to fit: 1105 × 691, 176 targets and 242,454,880 cache bytes.                                                                                     |
| Recovery densities         | Native acknowledgment records prove that recovery first drew 2400 × 1500 with 176 targets and 281,504,524 bytes, then fit at 1105 × 691 with 241 targets and 292,094,880 bytes.         |
| Comparison boundary        | The visible final zoom is the same, but one session has also retained transport resources prepared at 100%.                                                                             |
| Matched viewport cycle     | The functional witness retains both raw observations and drives the same real 100% → fit cycle in each session.                                                                         |
| Readiness                  | It waits for the exact acknowledged viewport/backing dimensions rather than a fixed delay.                                                                                              |
| Comparable resource counts | Initial, idle and recovery then all have 241 targets, 292,094,880 cache bytes and 97 uploads.                                                                                           |
| Unchanged bounds           | The original +2-target and 384 MiB bounds remain unchanged.                                                                                                                             |
| Retained transport bytes   | The extra 49,640,000 bytes (47.34 MiB) are retained two-density transport resources.                                                                                                    |
| No hidden allowance        | They are measured, not hidden by a larger allowance.                                                                                                                                    |
| Cold-input isolation       | This preparation is specific to resource comparison; none of the cold-input timing tests has been changed or warmed.                                                                    |
| v3 archive                 | The original v3 timeline and failure remain under `artifacts/effects-final-cohorts/v3/`.                                                                                                |
| v7 raw observations        | In the final v7 run, both raw initial and recovery acknowledgments already show the fit viewport, 176 targets and 242,454,880 bytes.                                                    |
| Matched cycle              | The same explicit 100% → fit cycle then yields the comparable 241 targets and 292,094,880 bytes in each session.                                                                        |
| Evidence paths             | Those raw observations, complete acknowledgment history and exact test/helper copies are preserved in `artifacts/effects-final-cohorts/v7/candidate/effect-library-50/` and `harness/`. |
| Retained assertions        | Pixel, source-SHA, alpha, canonical-preview and gesture checks all remain active.                                                                                                       |

## Environment and reproduction

| Context          | Recorded evidence                                                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser and GPU  | Linux x86_64, headless Chromium 156.0.8078.4, native WebGPU reporting Intel Xe-LPG, 1600 × 1000 CSS viewport and DPR 1.                                               |
| Process limits   | One worker ran with CPUQuota 200%, MemoryHigh 3800 MiB, MemoryMax 4500 MiB, MemorySwapMax 0, nice 15 and ionice 2/7.                                                  |
| Memory pressure  | The browser was launched after both memory PSI avg10 readings returned to zero; avg60 was also zero at launch; the recorded v7 scope retains all averages separately. |
| Backend boundary | Individual effect and transformed-group tests separately verify Three's genuine WebGL fallback; this 50-image witness specifically measures WebGPU.                   |

Follow [the isolation protocol](protocol.md), build a separate production output
with matching source maps, then run:

```sh
bunx playwright test test/browser/effect-library-load.spec.ts --config artifacts/effects-final-cohorts/candidate.config.ts --workers=1 --trace off
```

### Frozen evidence

| Context            | Recorded evidence                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Executable         | The executable is preserved under `artifacts/effects-final-cohort-v7-dist/`.                                                                                      |
| Source and harness | Its tracked diff, untracked source archive, compiled/source fingerprints and exact harness are under `artifacts/effects-final-cohorts/v7/`.                       |
| Metrics and images | Raw metrics are in `candidate/effect-library-50.json`; native PNGs, the canonical WebP and the exact handle/gesture record are in `candidate/effect-library-50/`. |
| HTTP fingerprint   | The HTTP index SHA-256 is `bd450e869491837c51ad3a2fcb611e2b2550c52e67390a0554e3cd8d1ccf8556`.                                                                     |
| Ignored assets     | These generated reports and original photographs are ignored, not committed as product assets.                                                                    |

## Separate legacy fifty-image workload

| Context                 | Recorded evidence                                                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Executed workload       | A fresh isolated process also passed the existing `performance.spec.ts` GPU and storage workload in 21.8 seconds (22.5 seconds with runner overhead).             |
| Useful frame and export | The first useful frame took 7,311 ms and the native full-resolution PNG export took 2,984 ms.                                                                     |
| Move and effect samples | Twelve move samples had median/p95 40.9/42.9 ms; twelve effect previews had 47.2/47.7 ms.                                                                         |
| Readbacks               | Actual production GPU, WebGL and Canvas2D pixel-read hooks stayed zero through preview, canonical encoding and durable recovery.                                  |
| Uploads and targets     | Source uploads remained 97, initial/recovered main targets were 176 and the final edited transport history retained 241 targets within the unchanged byte budget. |

Those are current functional-load measurements. They do not establish a cold-load
or export speedup over the historical v3 5,842/2,277 ms samples or earlier unmatched
runs. The raw report and scope are preserved at
`artifacts/effects-final-cohorts/v7/candidate/performance-50.json` and
`candidate/legacy50-scope.json`. Thumbnail arrival has its own matched boundaries
in [the latency report](thumbnail-latency.md).
