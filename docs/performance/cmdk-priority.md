# Cmd+K: input echo and correct-result convergence

This production pair separates responsive typing from the arrival of genuinely current results. In this single capped-host cohort, the priority candidate lowers input-echo tails while final-query results arrive later. It does **not** establish a general search speedup. Earlier [synchronous-candidate measurements](cmdk.md) remain intact; their second-RAF proxy is not reused as a fresh-results metric.

## Frozen executables and protocol

- Baseline: `85bd7767410cfbabe290134cb8178fb2f895daf2` plus one reviewed measurement attribute: `data-search-query={query}` on its existing `CommandList`. The exact one-line diff is retained as `criteria-baseline/measurement.patch`, SHA-256 `c5769e739ed137024e34e7259d5b06644b68970baea17dbbcc91dbb454bac483`. It changes no ranking, scheduling, style or command behavior. There is no CSS consumer; the existing scroll-shadow observer watches child-list changes, not attributes.
- Candidate: `dd4fba358cfe7ecd8d8a462fb2905d313cf7e590`, using canonical `useDeferredValue` priority separation, without a debounce timer. Its result region exposes the displayed query and reports pending criteria through `data-search-pending`, `aria-busy` and `inert`.
- Later button-target, IME Escape and selection guards on the final branch are validated separately. They are **not** part of the frozen `dd4fba3` executable profiled here; these timings must not be attributed to the final branch head.
- Each detached source tree has retained production JavaScript and matching maps. Baseline's instrumentation diff is explicit; candidate's tracked tree is unchanged. Reused workspace dependencies were checked against the frozen revisions.
- Same order and byte-identical harness: one post-edit 150-layer case, ordinary 150-layer AFTERHOURS, then 50 local images / 100 effects. Each test uses a fresh context; the browser/GPU process and OS caches may remain shared. The artwork contains 150 editable layers / four effects; the photographic scene contains 108 total layers.
- Chromium `156.0.8078.4`, Linux x86_64 / Fedora kernel `7.2.8-200.fc44.x86_64`, Intel Core Ultra 5 125H, 1600 × 1000, DPR 1, French UI, normal motion, foreground visibility. The intercepted actual adapter is Intel `xe-lpg`, nonfallback; the renderer reports `webgpu`.
- Serial systemd scope: CPU quota 200%, memory high/max 2600/3200 MiB, swap disabled, nice 15, I/O class 2/priority 7. Browser Node heap 1536 MiB; build heap 2304 MiB. No other team browser/build/typecheck ran during the pair. Shared-host drift remains possible; this is not a randomized, replicated A/B study.

Canonical canvas readiness and decoded visible thumbnails are preparation. Baseline preparation was 4.22 / 12.39 seconds; candidate preparation 4.16 / 10.41 seconds. No Cmd+K warmup is hidden in preparation.

## What is actually observed

The [native scenario](../../test/browser/search-performance.spec.ts) sends real Ctrl+K, Escape and keyboard input. Seven queries are `flou`, `layer`, `zzzznone`, `flou`, `layer`, `zzzznone`, `flou`, giving 38 characters and seven final-query samples per workload. Requested inter-character delay is 20 ms; actual delivered spacing is retained because driver acknowledgments, scheduling and application work affect it.

The [probe](../../test/browser/support/search-profile.ts) uses one RAF observer and records independent native-key timestamps, input capture, input echo and correct-result observations:

1. **Echo:** the first RAF at which the actual input value matches that native input sample and has not been superseded.
2. **Correct latest results:** the first RAF at which the displayed region's committed query equals the sample, the input still equals it, and pending is false. Baseline's single attribute belongs to the same synchronous React commit as its results.
3. **Final convergence:** the last character of each complete query to its correct-results observation. The scenario also requires a second consecutive RAF with those same current criteria before continuing. Real `flou` results and the genuine empty state are asserted.

A prefix superseded before observation receives no invented latency. Observed and superseded counts are explicit. Pending old results never count as fresh; captured pending regions must actually be inert and busy. First RAF is a presentation-opportunity proxy, **not INP, GPU duration or physical display latency**. Full snapshots, accessibility-tree traversal and screenshots stay outside measured frames. The old second-RAF fields remain explicitly historical scheduler-opportunity data.

## Results

Milliseconds, baseline → candidate. p95 uses sorted index `floor(n × .95)`; with seven final queries it is the maximum of seven. Different observed-prefix denominators must not be interpreted as equivalent full-population distributions.

| Boundary                                 |                 150 layers |    50 images / 100 effects |
| ---------------------------------------- | -------------------------: | -------------------------: |
| Input echo median                        |                14.2 → 12.3 |                13.5 → 12.2 |
| Input echo p95 / max, n=38 each          | 77.0 / 112.1 → 42.3 / 50.0 |  84.6 / 92.8 → 50.4 / 63.5 |
| Echo prefixes observed / superseded      |            38 / 0 → 38 / 0 |            38 / 0 → 38 / 0 |
| Fresh prefixes observed / superseded     |           38 / 0 → 25 / 13 |           38 / 0 → 28 / 10 |
| Observed-prefix fresh p95                |     77.0 → 63.7, n=38 → 25 |     84.6 → 76.5, n=38 → 28 |
| Final-query convergence median, n=7 each |                11.1 → 34.0 |                12.0 → 29.3 |
| Final-query convergence p95, n=7 each    |                50.6 → 86.3 |                25.9 → 67.9 |
| Final-query second-RAF confirmation p95  |               79.2 → 111.7 |                38.5 → 92.5 |
| Final results after echo, median / max   |        0 / 0 → 20.4 / 45.3 |        0 / 0 → 16.8 / 47.7 |
| Whole burst to correct final query, p95  |              371.1 → 263.0 |              408.3 → 341.8 |
| Actual inter-key median / p95, n=31 each | 31.2 / 113.9 → 33.6 / 63.8 | 34.8 / 108.9 → 32.2 / 88.3 |

The candidate observed 38 pending/stale result regions at input echo in each scene; every one was busy and inert. Baseline observed none. All seven final queries converged in both builds. Candidate fresh-prefix p95 is **not** a win obtained from old DOM: 13/10 obsolete prefixes were explicitly skipped, and fixed-count final convergence is separately slower. The echo-tail improvement is an observation from this pair, not a universal performance guarantee. Delivered input spacing differs despite the same requested delay; the burst figures include that native/browser/driver pipeline.

Opening is also workload-dependent: cold current-empty results took 97.7 → 80.9 ms / 154.1 → 111.6 ms, while warm-opening p95 was 187.7 → 159.6 ms / 126.8 → 142.1 ms. Cold entrance settlement was 186.7 → 158.8 ms / 191.3 → 189.6 ms. Six warm openings and one cold opening cannot establish a general opening improvement; previous cohort variability remains documented.

Both builds have zero additional App, Inspector, CanvasArea, EditorCanvas or EditorScene React commits during ordinary input; stable renderer instances; zero GPUQueue submissions and renderer-frame increments; zero WebGPU/WebGL/Canvas2D/VideoFrame readbacks. Project hashes and canonical revisions are unchanged.

## Input immediately after a committed edit

One validated transaction changes opacity on all 150 actual artwork layers, then native input opens Cmd+K and types `layer`. There is no snapshot, flush, thumbnail settlement or explicit idle wait between the edit and input. Revision advances exactly once; one undo restores every original page/layer value.

| Boundary                                   |       Baseline |      Candidate |
| ------------------------------------------ | -------------: | -------------: |
| Echo median / max, five characters         | 47.5 / 67.9 ms | 11.7 / 28.5 ms |
| Fresh prefixes observed / superseded       |          5 / 0 |          2 / 3 |
| Final correct result, last key → first RAF |        29.8 ms |       131.8 ms |
| Final correct result, second confirmation  |        47.6 ms |       143.5 ms |
| Whole native burst → correct final query   |       353.0 ms |       298.4 ms |

This is the clearest tradeoff: substantially earlier field echo with a longer final-result tail. Only one post-edit query is measured per build. Raw edit-return-to-key clocks remain available; no claim is made that GPU work was still pending at that first key event.

## Captures, profiles and reproduction

Both three-case native cohorts passed: baseline 1.3 minutes, candidate 1.1 minutes, including separate heavy CPU/Blink diagnostics and post-measure screenshots. Builds passed in 9.17 / 11.06 seconds. Empty and `flou` palette screenshots are captured only after timing and profiler detachment. Both preview processes were stopped afterward.

The diagnostic warm cycle retains CDP CPU samples, Blink invalidation traces, exact monotonic clocks and its own per-key echo/results samples. Trace overhead is excluded from every unprofiled metric; diagnostic wall time is not interaction latency. Raw files under ignored `artifacts/cmdk-profile/{criteria-baseline,criteria-candidate}` retain maps, output, provenance, patch/checksums, native logs, all sample outcomes, private-document hashes, actual counters and screenshots. `criteria-summary.json` contains distributions and skipped counts; `analyze-criteria.ts` produces it. Legacy `analyze.ts` rejects this v2 schema to prevent calling its old proxy fresh results.

Reproduce with the [repository protocol](protocol.md), the retained measurement patch and `test/browser/search-performance.spec.ts`, one worker, identical scope limits and the same three-case order. Set `MUSART_CMDK_SHA`, `MUSART_CMDK_PATCH_SHA` for the baseline, and `MUSART_CMDK_OUTPUT` to distinct cohort directories. Do not reuse an earlier build whose result region lacks the committed-query attribute.
