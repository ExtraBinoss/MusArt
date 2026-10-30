# Cmd+K production profiling

This report records the synchronous candidates through `24e4c4a`. The later [input-priority report](cmdk-priority.md) measures input echo and correctly committed latest results independently. The historical second-RAF numbers below must not be reinterpreted as fresh-results latency.

Measured on 2026-10-30 using the [reproducible performance protocol](protocol.md). The final implementation passes native interaction and document-isolation checks. The matched production comparison has mixed latency results and does **not** establish a general typing or opening speedup. Earlier favorable measurements are retained as history, not selected as the headline result.

## Frozen builds and environment

- Baseline: `85bd7767410cfbabe290134cb8178fb2f895daf2`. The original `baseline` and order-matched `baseline-matched` cohorts use the exact same compiled output.
- First candidate: `8f63ab1a907d416ac4bb75cabd72ef420d7d1792`, retained under `final` for historical comparison.
- Final verified search: `24e4c4a9eee112c90035bb1f5b8a6aaf52542343`, under `final-verified`.
- Each build came from its own detached worktree with tracked files unchanged. Production JavaScript and matching source maps remain under `artifacts/cmdk-profile/{baseline,final,final-verified}/dist`; `baseline-matched/dist` links to `baseline/dist`. Root and web-workspace dependency links were reused; `packages/core`, `packages/render` and `packages/assets` had no diff against their frozen revisions.
- Chromium `156.0.8078.4`, headless Linux x86_64, Fedora kernel `7.2.8-200.fc44.x86_64`, Intel Core Ultra 5 125H, 1600 × 1000 viewport, DPR 1, foreground visibility, French UI, normal motion preference.
- The renderer's intercepted `requestAdapter()` returned Intel `xe-lpg`, `isFallbackAdapter: false`; its canvas reported `webgpu`. Device and description strings were empty. This identifies the actual requested adapter rather than inferring hardware from launch flags.
- One serial cohort at a time: systemd scope `CPUQuota=200%`, `MemoryHigh=2600M`, `MemoryMax=3200M`, `MemorySwapMax=0`; nice 15, I/O class 2/priority 7. Browser Node heap capped at 1536 MiB; build heap at 2304 MiB. These capped, shared-workstation results do not predict uncapped devices.

The workload is genuine editable AFTERHOURS artwork with 150 layers and four effects, then the existing `?benchmark=50` scene with 50 local photographic images, 100 effects and 108 total layers. Canonical renderer readiness, thumbnail flush and decoded visible thumbnails are preparation, recorded separately. Preparation took 2.68/7.22 seconds for the original baseline, 2.24/5.37 seconds for the matched baseline and 2.68/7.73 seconds for the final build. The first palette opening remains cold; preparation never opens Cmd+K.

The original baseline ran `[steady 150, steady 50]`, then its post-edit case in a separate browser process after the harness was extended. Candidates ran `[post-edit 150, steady 150, steady 50]`. Every test has a fresh browser context, but browser/GPU processes and OS caches can remain shared. One additional baseline cohort therefore uses the same three-case order and byte-identical harness as the final build, reusing the original frozen executable. It is the primary comparison below. Matching order does not eliminate shared-workstation/cache drift; these are not randomized, replicated A/B cohorts. The substantial preparation-time variation is retained rather than hidden.

## Input and measurement boundaries

The checked-in [native scenario](../../test/browser/search-performance.spec.ts) sends real `Control+k`, `Escape` and `keyboard.type()` events. Requested typing delay is 20 ms per character. Queries are `flou`, `layer`, `zzzznone`, `flou`, `layer`, `zzzznone`, `flou`: seven openings, six warm openings and 38 delivered characters per workload.

The [probe](../../test/browser/support/search-profile.ts) retains each native key event timestamp, capture/input-dispatch clock, first RAF, second RAF, observed input value, option count and small result text. Opening waits for the actual focused combobox. A separate clock records the outer panel and inner surface reaching essentially opaque, settled positions. Input latency below means native key timestamp to the second observed RAF with the result DOM sampled; it is a presentation-opportunity proxy, **not INP, GPU duration or physical display latency**. Capture-to-RAF values are also retained in raw JSON.

No full document snapshot, accessibility-tree traversal or screenshot runs inside the measured input frames. Rapid input can advance to another character before a frame: the original baseline had seven such samples per workload, the matched baseline nine each, the first candidate nine/ten, and the final build ten each. The final query must still have the expected results or genuine empty state. Thus these measurements show input responsiveness and a result-presentation opportunity, not proof that every intermediate prefix was separately painted.

## Unprofiled timing results

Milliseconds; the primary comparison uses one matched-order cohort per frozen executable, with six warm openings and 38 input samples per workload. The original baseline is retained separately as history. p95 uses the sorted sample at `floor(n × 0.95)`, so warm-opening p95 is the maximum of six samples. This small cohort supports observations, not a population-level performance guarantee.

| Workload / boundary                                         |   Matched baseline |     Final verified |
| ----------------------------------------------------------- | -----------------: | -----------------: |
| 150 layers: cold open → second RAF                          |              123.4 |              107.2 |
| 150 layers: cold entrance settled                           |              185.4 |              163.3 |
| 150 layers: warm open median / p95                          |        45.3 / 70.0 |        50.3 / 67.0 |
| 150 layers: warm entrance settled median / p95              |      148.2 / 164.2 |      145.8 / 157.3 |
| 150 layers: typing median / p95 / max                       | 28.1 / 35.2 / 38.7 | 28.4 / 52.0 / 59.2 |
| 50 images / 100 effects: cold open → second RAF             |               53.5 |               61.6 |
| 50 images / 100 effects: cold entrance settled              |              153.9 |              154.3 |
| 50 images / 100 effects: warm open median / p95             |        39.9 / 52.1 |        44.4 / 81.1 |
| 50 images / 100 effects: warm entrance settled median / p95 |      143.2 / 152.0 |      151.6 / 156.9 |
| 50 images / 100 effects: typing median / p95 / max          | 27.7 / 39.6 / 42.4 | 28.3 / 38.7 / 38.9 |

The matched comparison improves the sampled 150-layer cold opening and post-edit opening, while its typing p95 worsens from 35.2 to 52.0 ms. Image-workload typing is similar, while warm opening p95 worsens from 52.1 to 81.1 ms. These measurements support neither a general speedup nor attributing every difference to source changes. Final untraced long-task durations were `[82,50]` / `[51,66]` ms, versus matched-baseline `[110,51]` / `[]`; no general long-task reduction is claimed.

### First candidate, retained history

The initial candidate had a cold-opening regression. It was retained, diagnosed and followed by controlled initial selection, guarded `preventScroll` focus and palette layout/style/paint containment. These results were not replaced by favorable reruns of the same executable:

| Workload / boundary                                         |           Baseline |            Updated |
| ----------------------------------------------------------- | -----------------: | -----------------: |
| 150 layers: cold open → second RAF                          |               75.6 |              145.8 |
| 150 layers: cold entrance settled                           |              168.7 |              189.4 |
| 150 layers: warm open median / p95                          |        52.5 / 71.3 |        63.0 / 87.6 |
| 150 layers: warm entrance settled median / p95              |      147.6 / 153.5 |      150.3 / 168.2 |
| 150 layers: typing median / p95 / max                       | 28.0 / 68.2 / 88.7 | 28.9 / 49.7 / 70.8 |
| 50 images / 100 effects: cold open → second RAF             |               70.8 |              144.9 |
| 50 images / 100 effects: cold entrance settled              |              168.3 |              195.2 |
| 50 images / 100 effects: warm open median / p95             |       78.3 / 138.7 |       77.6 / 121.9 |
| 50 images / 100 effects: warm entrance settled median / p95 |      149.7 / 161.1 |      155.0 / 175.3 |
| 50 images / 100 effects: typing median / p95 / max          | 29.4 / 71.9 / 81.2 | 28.8 / 60.8 / 98.8 |

The first candidate reduced typing p95 by 27%/15%, while its image-workload worst sample increased and both cold openings were slower. Its untraced long-task durations were `[107,49,52,59,72,55]` / `[126,77,85,58,98,53,73]` ms.

Comparing the final build against this original baseline would suggest typing p95 improvements from 68.2 to 52.0 ms / 71.9 to 38.7 ms. The matched-order baseline does not reproduce that conclusion. Likewise, the original 150-layer cold first-frame proxy was 75.6 ms, faster than the final 107.2 ms, while the matched baseline was 123.4 ms. These reversals are retained explicitly; no favorable cohort is selected to claim success.

For all three builds and both workloads, the five actual React counters (`App`, `Inspector`, `CanvasArea`, `EditorCanvas`, `EditorScene`) were unchanged across all palette input. Actual GPUQueue submissions were zero; WebGPU reads, WebGL reads, Canvas2D reads and VideoFrame copies were zero. Renderer instance counts were stable. SHA-256 document hashes and engine revisions were unchanged.

## Immediate input after a committed edit

Each cohort includes one native post-edit cycle changing opacity across all 150 actual artwork layers using one validated `updateLayers` transaction, then sending Ctrl+K and typing `layer`. The original baseline's cycle was added separately as described above. There is no snapshot, flush, thumbnail settlement or explicit idle wait between the edit and input. Input starts once the real combobox has focus, without waiting for its entrance animation. A full inspection happens afterward: revision advances exactly once, all 150 values change, and one undo restores every original page/layer value.

| Boundary                                |               Original baseline |                Matched baseline |                 First candidate |                  Final verified |
| --------------------------------------- | ------------------------------: | ------------------------------: | ------------------------------: | ------------------------------: |
| Synchronous edit call                   |                          4.8 ms |                          4.4 ms |                          5.1 ms |                          3.0 ms |
| Edit return → native open-key timestamp |                         48.5 ms |                         25.4 ms |                         43.3 ms |                         25.0 ms |
| Open key → second RAF                   |                        199.4 ms |                         85.0 ms |                         93.0 ms |                         58.9 ms |
| Five input samples, in order            | 84.4, 96.1, 87.3, 57.5, 36.8 ms | 38.8, 33.2, 36.8, 25.9, 28.5 ms | 48.3, 61.1, 67.7, 20.6, 27.7 ms | 30.3, 35.9, 28.5, 23.2, 28.9 ms |

The transport gap is explicitly retained; “immediate” means no application flush or quiet-period wait was inserted. This case does not assert that the GPU was still pending at the first key event.

## Diagnostic attribution and preserved experiments

An additional fresh-context diagnostic profiles only the **first** Cmd+K opening on the genuine 150-layer fixture, from the native open-key clock through entrance settlement. It uses CPU sampling plus a light Blink timeline, without invalidation tracking. Its mapped stacks identify the remaining mount bottlenecks:

| Cold diagnostic path                            | Baseline self time | First candidate self time | Final self time | Final forced style duration |
| ----------------------------------------------- | -----------------: | ------------------------: | --------------: | --------------------------: |
| cmdk selection layout effect → `scrollIntoView` |           61.51 ms |                  29.75 ms |        32.90 ms |                    31.81 ms |
| MusArt `onOpenAutoFocus` → input `focus()`      |           31.77 ms |                  20.97 ms |        12.11 ms |                    10.25 ms |
| Radix Presence `getAnimationName` → style query |           42.55 ms |                  16.97 ms |        11.72 ms |                     7.28 ms |

The final cold diagnostic contains 16 `UpdateLayoutTree` events totalling 59.05 ms, four `Layout` events totalling 5.53 ms, and 30 paints totalling 4.33 ms. Baseline style/layout totals were 119.96/39.67 ms; first-candidate totals were 74.52/3.34 ms. These profiled costs do not causally explain the separate untraced cold-frame differences; they identify synchronous style/layout flushes, with cmdk scrolling still visible. `cold-open-150.{json,cpuprofile,trace.json}` and `cold-analysis.json` preserve exact clocks, mapped call paths and Blink layout stacks. The [dedicated diagnostic](../../test/browser/search-cold-profile.spec.ts) deliberately does not assert a latency budget from a profiled run.

After the unprofiled cohort, a separate warm open/type/close cycle records CDP CPU samples at 1 ms plus a Blink timeline with invalidation reasons. `NavigationStart`, CDP timestamp and browser monotonic clocks delimit the diagnostic input window. Matching source maps map frames back to React DOM, cmdk, Radix Presence, Motion and MusArt search sources.

The diagnostic hot paths include DOM `appendChild`/`removeChild`/`insertBefore` during React commits, Radix presence style queries, cmdk `scrollIntoView`, focus and result ranking/allocation. Rendering the editor is not implicated by its measured counters. The updated source isolates query state, retains rows, removes redundant fuzzy filtering and per-row Motion work, and avoids an opaque panel's inherited backdrop blur. Ranking still scores every normalized candidate; a bounded heap retains and sorts only the best 80 rather than allocating and sorting all matches. Mount/unmount and browser style/layout work remain visible. Invalidation tracing greatly inflates DOM costs; its self-time values are **diagnostic attribution only**, and are excluded from every timing table above.

An initial cohort used Playwright role assertions between keyboard events. Its CPU profile exposed accessibility-query overhead (`getImplicitAriaRole`/`getRootNode`). It was preserved under `baseline/locator-overhead-cohort` and excluded from comparisons. Two initial detached builds failed because the web workspace dependency link was missing; the exact resolution error is retained in `baseline/build.log`. A first post-edit fixture attempt reused a project ID as a layer ID; validation rejected it before any timing sample, retained in `baseline/post-edit-invalid-fixture.log`.

## Reproduction and artifacts

Use a detached worktree for the desired SHA, link both root and `apps/web/node_modules`, and verify that any linked workspace source packages equal that SHA. Build once with matching maps, preview that exact output on port 6201, then use an ignored config importing `playwright.config.ts` with `webServer: undefined`, `trace: "off"`, and `baseURL: "http://127.0.0.1:6201"`.

```sh
./node_modules/.bin/vite build --outDir /absolute/path/to/cohort/dist --sourcemap
./node_modules/.bin/vite preview --outDir /absolute/path/to/cohort/dist --host 127.0.0.1 --port 6201 --strictPort
curl --fail --silent http://127.0.0.1:6201/ > /dev/null
MUSART_CMDK_SHA=<frozen-sha> MUSART_CMDK_OUTPUT=artifacts/cmdk-profile/cohort \
  ./node_modules/.bin/playwright test test/browser/search-performance.spec.ts \
  --config artifacts/cmdk-profile/playwright.config.ts --workers=1
```

Apply the scope and priority limits above to the build and browser commands. The original baseline steady-state cohort passed two tests in 43.8 seconds and its separate post-edit case passed in 6.2 seconds. The matched baseline passed all three in 37.0 seconds without rebuilding its executable. The first candidate passed three tests in 55.9 seconds; the final verified build passed three in 44.9 seconds. Cold-only diagnostics passed separately in 7.5/5.4/4.4 seconds. Production builds passed in 8.71/8.71/6.02 seconds. All preview processes were stopped after measurement.

Ignored `artifacts/cmdk-profile/{baseline,baseline-matched,final,final-verified}` retain raw per-event JSON, counters, hashes, renderer metadata, screenshots, CPU profiles, Blink traces, build/browser logs, host/provenance records, source maps and exact compiled output. `summary.json` contains all raw latency arrays and mapped diagnostic source totals; `post-edit-150.json` retains the edit and input clocks. `run-commands.txt` and the ignored browser config retain the exact commands and server options. These files are local evidence, not published repository artifacts.
