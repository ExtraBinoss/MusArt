# Live canvas density

The native diagnosis distinguishes a sampled preview from an export at a different scale. A live canvas and PNG at the **same effective density** matched every decoded RGBA byte. Enlarging a limited preview raster caused the observed loss of sharpness; the analytical text source remained reusable.

## Diagnosis

The 150-layer AFTERHOURS artwork is 1080 × 1920. Before the correction, its per-layer rectangle heuristic calculated a safe scale of 1.033, then rounded down to 1×. This counted 19.51 million primitive pixels (about 74.4 MiB) for shapes that actually render as an instanced batch. It also multiplied fixed effect-reference costs by the requested view density.

| Native observation                                           | Before                                           | Verified after                                          |
| ------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------- |
| DPR 1, fit 43.75%                                            | 473 × 840, approximately one texel/display pixel | 473 × 840, same physical footprint                      |
| DPR 1, 100%                                                  | 1080 × 1920, one texel/display pixel             | 1080 × 1920, same physical footprint                    |
| DPR 1, 200%                                                  | 1080 × 1920, half a texel/display pixel          | 2160 × 3840, one texel/display pixel                    |
| DPR 2, fit 43.75%                                            | Original fit observation excluded                | 945 × 1680, one texel/display pixel                     |
| DPR 2, 100%                                                  | 1080 × 1920, half a texel/display pixel          | 2160 × 3840, one texel/display pixel                    |
| DPR 2, 200%                                                  | 1080 × 1920, a quarter texel/display pixel       | 2160 × 3840, half a texel/display pixel; memory-limited |
| Independent 192 × 128 control, DPR 1 → 2 without canvas zoom | 192 × 128 after silent CDP override              | 384 × 256 after the native resize signal                |

The baseline development-browser diagnosis passed in 17.8 seconds. Raw data and PNGs are retained in ignored `artifacts/preview-density/baseline/`. Its DPR-2 fit observation is excluded from comparison: the original fixed wait could precede CmdK's completed fit and quiet density update. The final test waits for the correct project, settled fit pose, exact expected backing and real canonical draw instead of extending that wait.

## Correction and limits

A rearmed resolution media query observes actual DPR changes independently of canvas zoom. Window/visual-viewport resize events share that observer, and unchanged DPR creates no additional work. One 140 ms quiet timer is retired on cleanup; there is no continuous React/frame subscription.

The render-side estimator follows the existing graph: instanced primitive buffers, actual clipped group viewports, normal versus blend targets, text/vector surfaces, shared scratch and mipmapped fixed 1× effect/mask subtrees. Visible mask sources still count when omitted from the main paint list; explicitly invisible/zero-opacity mask lineages follow the renderer's skipped path. A layer painted and reused as a mask shares its same density/window entry.

Original photos are deduplicated by asset and kept separate from target cost. Independently timed video layers each reserve one copied source plus their bounded three-slot upload ring. The target estimate remains **192 MiB**, including 16 MiB of headroom. Estimated sources plus targets also face the existing **384 MiB** total; actual retained, pooled and in-flight admission remains the renderer cache's responsibility. These estimates do not guarantee that total cache occupancy stays below 192 MiB. If fixed content already makes admission impossible, a one-pixel request would not solve it: the UI retains a useful bounded request and the renderer reports the real failure.

Above 1×, stable quarter-density tiers can use an intermediate budget instead of falling to the preceding power of two. Boundary noise such as 2.000000003 does not allocate a 2.25× tier. Minified and enlarged requests both obey the 64-megapixel/API 16,384-edge bounds and the acquired device's actual texture limit. The native WebGPU device exposes 8192 in this environment. Plain giant instanced shapes do not inherit an isolated-texture limit they never allocate.

For AFTERHOURS, the estimate separates 61,253,480 fixed bytes from 113,128,644 density-dependent bytes at 2×. With the unchanged headroom this admits 2×. At 4× it does not: high zoom on DPR 2 can still magnify a budget-limited raster. Effects and masks deliberately keep their authored 1× reference; this change does not replace those effect pixels with unbounded vector rendering or raise device limits.

## Verification

Focused mirrors cover DPR rearming/coalescing/cleanup, floating tier boundaries, visible/hidden/shared masks, clipped groups, video layers sharing an original, fifty photo originals above the target soft budget, infeasible fixed originals, huge/thin page bounds and renderer lifecycle. The companion Slug six-file unit batch passed 26 cases alongside ten density-cost cases. The later shared-mask assertion also passed in the parent’s final focused cost/passes/coverage/index batch (15 cases). The DPR observer and EditorScene/PlaneResources lifecycle mirrors passed separately; the public pure-helper import also passed the focused quality mirror.

A minimal native diagnostic also established a CDP limitation: overriding only deviceScaleFactor changes the DPR getter and media-query values without emitting media/resize events. That is not a reason to add polling to the app. The final native case delivers the changed DPR together with a real 1600 → 1599 → 1600 viewport resize, records those native events and keeps the canvas zoom and final viewport unchanged. Canvas layout counters are recorded without attributing them to pure DPR; App/Inspector, uploads and renderer identity retain their assertions.

The permanent native case is `test/browser/preview-density.spec.ts`. It checks AFTERHOURS at fit/100%/200%, DPR 1/2, a DPR change without zoom and the independent small control. It records target/source estimates, actual backing/CSS footprint, acquired limit, cache bytes, uploads, editor React counters and real read APIs. PNG decoding occurs in a separate inspection page; production GPU/WebGL/Canvas readbacks must remain zero. Zoom must retain source uploads; the emulated display transition must retain App/Inspector counters, source uploads and the renderer instance. The leaf watcher mirror separately verifies coalescing and cleanup without React state.

The final complete native case **passed in 1.1 minutes** (1.2 minutes including runner setup), with ten recorded states and exact live/export RGBA equality in all of them. Every image also retained genuine contrast (RGB range 254–255), rather than accepting two empty frames. AFTERHOURS source uploads stayed at 16 through fit/zoom/DPR changes. The independent control added its own source once (17), then changed DPR with no further upload or renderer replacement. App/Inspector stayed stable during navigation/display changes; all canvas counters are retained in the JSON. Application GPU/WebGL/Canvas read-API probes remained zero.

Estimated current targets at 2× were 166.304 MiB plus the 16 MiB allowance, within the 192 MiB target. Actual retained cache occupancy peaked at **220.900 MiB**, including cached prior densities/project content, below the unchanged 384 MiB hard admission limit. That measured difference is why the target estimate is not described as a total-cache guarantee. The actual acquired WebGPU texture limit was 8192; the backing never exceeded it or the 64-megapixel API bound.

The final case ran on Chrome 156.0.8078.4, Linux `7.2.8-200.fc44.x86_64`, 1600 × 1000 final viewport, under a serial 200% CPU / 2600 MiB MemoryHigh / 3200 MiB MemoryMax / zero-swap scope, with one worker and low process/I/O priority. Sources were frozen for the complete case; `final/source-head.txt`, retained diff and source hashes identify that checkout. Raw JSON, ten PNG pairs and the passing log are under `artifacts/preview-density/final/` and `final-browser.log`.

Failed setup logs (the initial Node/WASM import, stale Vite package-export cache) and the unsupported silent-CDP observation are retained. An in-progress case was interrupted to let the requested mobile navigation appear before the final UI-frozen verification.

These are functional pixel/resource checks in a frozen development session, not production latency benchmarks, GPU-duration measurements or a promise of unlimited sharpness at every zoom. The shared [performance protocol](protocol.md) applies to any subsequent timing claim.
