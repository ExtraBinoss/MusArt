# Cmd+K production profiling

Status: investigation in progress. The updated build below is the first candidate, before the follow-up cold-mount work. Its mixed opening results must not be presented as the completed opening optimization.

Measured on 2026-10-30 using the [reproducible performance protocol](protocol.md). These are native browser measurements, not development-server timings. The source changes reduce the typing tail in this cohort; they do **not** establish faster cold opening.

## Frozen builds and environment

- Baseline: `85bd7767410cfbabe290134cb8178fb2f895daf2`.
- Updated search: `8f63ab1a907d416ac4bb75cabd72ef420d7d1792`.
- Each build came from its own clean, detached worktree. Production JavaScript and matching source maps remain under `artifacts/cmdk-profile/{baseline,final}/dist`. Root and web-workspace dependency links were reused; `packages/core`, `packages/render` and `packages/assets` had no diff against their frozen revisions.
- Chromium `156.0.8078.4`, headless Linux x86_64, Fedora kernel `7.2.8-200.fc44.x86_64`, Intel Core Ultra 5 125H, 1600 × 1000 viewport, DPR 1, foreground visibility, French UI, normal motion preference.
- The renderer's intercepted `requestAdapter()` returned Intel `xe-lpg`, `isFallbackAdapter: false`; its canvas reported `webgpu`. Device and description strings were empty. This identifies the actual requested adapter rather than inferring hardware from launch flags.
- One serial cohort at a time: systemd scope `CPUQuota=200%`, `MemoryHigh=2600M`, `MemoryMax=3200M`, `MemorySwapMax=0`; nice 15, I/O class 2/priority 7. Browser Node heap capped at 1536 MiB; build heap at 2304 MiB. These capped, shared-workstation results do not predict uncapped devices.

The workload is genuine editable AFTERHOURS artwork with 150 layers, then the existing `?benchmark=50` scene with 50 local photographic images and 100 effects. Canonical renderer readiness, thumbnail flush and decoded visible thumbnails are preparation, recorded separately. Preparation took 2.68/7.22 seconds for the two baseline workloads. The first palette opening remains cold; preparation never opens Cmd+K.

## Input and measurement boundaries

The checked-in [native scenario](../../test/browser/search-performance.spec.ts) sends real `Control+k`, `Escape` and `keyboard.type()` events. Requested typing delay is 20 ms per character. Queries are `flou`, `layer`, `zzzznone`, `flou`, `layer`, `zzzznone`, `flou`: seven openings, six warm openings and 38 delivered characters per workload.

The [probe](../../test/browser/support/search-profile.ts) retains each native key event timestamp, capture/input-dispatch clock, first RAF, second RAF, observed input value, option count and small result text. Opening waits for the actual focused combobox. A separate clock records the outer panel and inner surface reaching essentially opaque, settled positions. Input latency below means native key timestamp to the second observed RAF with the result DOM sampled; it is a presentation-opportunity proxy, **not INP, GPU duration or physical display latency**. Capture-to-RAF values are also retained in raw JSON.

No full document snapshot, accessibility-tree traversal or screenshot runs inside the measured input frames. Rapid input can advance to another character before a frame: the baseline had seven such samples per workload, the updated build nine/ten. The final query must still have the expected results or genuine empty state. Thus these measurements show input responsiveness and a result-presentation opportunity, not proof that every intermediate prefix was separately painted.

## Unprofiled timing results

Milliseconds; one cohort per frozen build, six warm openings and 38 input samples per workload. p95 uses the sorted sample at `floor(n × 0.95)`, so warm-opening p95 is the maximum of six samples. This small cohort supports observations, not a population-level performance guarantee.

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

Typing p95 fell by 27% for 150 layers and 15% for the image workload. The image-workload worst sample increased, both cold openings were slower, and warm opening did not improve consistently. The measured evidence therefore supports reduced typing-tail work, while cold mounting/focus/layout remains an optimization target. Untraced long-task durations were `[64,78,54]` / `[59,112,54,84,62]` ms in the baseline and `[107,49,52,59,72,55]` / `[126,77,85,58,98,53,73]` ms in the updated build; no general long-task reduction is claimed.

For both builds and workloads, the five actual React counters (`App`, `Inspector`, `CanvasArea`, `EditorCanvas`, `EditorScene`) were unchanged across all palette input. Actual GPUQueue submissions were zero; WebGPU reads, WebGL reads, Canvas2D reads and VideoFrame copies were zero. Renderer instance counts were stable. SHA-256 document hashes and engine revisions were unchanged.

## Immediate input after a committed edit

A separate, single native cycle per build changes opacity across all 150 actual artwork layers using one validated `updateLayers` transaction, then sends Ctrl+K and types `layer`. There is no snapshot, flush, thumbnail settlement or explicit idle wait between the edit and input. Input starts once the real combobox has focus, without waiting for its entrance animation. A full inspection happens afterward: revision advances exactly once, all 150 values change, and one undo restores every original page/layer value.

| Boundary                                |                        Baseline |                         Updated |
| --------------------------------------- | ------------------------------: | ------------------------------: |
| Synchronous edit call                   |                          4.8 ms |                          5.1 ms |
| Edit return → native open-key timestamp |                         48.5 ms |                         43.3 ms |
| Open key → second RAF                   |                        199.4 ms |                         93.0 ms |
| Five input samples, in order            | 84.4, 96.1, 87.3, 57.5, 36.8 ms | 48.3, 61.1, 67.7, 20.6, 27.7 ms |

The transport gap is explicitly retained; “immediate” means no application flush or quiet-period wait was inserted. This case does not assert that the GPU was still pending at the first key event.

## Diagnostic attribution and preserved experiments

An additional fresh-context diagnostic profiles only the **first** Cmd+K opening on the genuine 150-layer fixture, from the native open-key clock through entrance settlement. It uses CPU sampling plus a light Blink timeline, without invalidation tracking. Its mapped stacks identify the remaining mount bottlenecks:

| Cold diagnostic path                            | Baseline self time | Updated self time | Updated forced style duration |
| ----------------------------------------------- | -----------------: | ----------------: | ----------------------------: |
| cmdk selection layout effect → `scrollIntoView` |           61.51 ms |          29.75 ms |                      29.56 ms |
| MusArt `onOpenAutoFocus` → input `focus()`      |           31.77 ms |          20.97 ms |                      19.25 ms |
| Radix Presence `getAnimationName` → style query |           42.55 ms |          16.97 ms |                      14.52 ms |

The updated cold diagnostic contains 16 `UpdateLayoutTree` events totalling 74.52 ms, four `Layout` events totalling 3.34 ms, and 30 paints totalling 4.28 ms. Baseline style/layout totals were 119.96/39.67 ms. These profiled costs do not causally explain the separate untraced opening regression; they identify synchronous style/layout flushes to investigate. `cold-open-150.{json,cpuprofile,trace.json}` and `cold-analysis.json` preserve exact clocks, mapped call paths and Blink layout stacks. The [dedicated diagnostic](../../test/browser/search-cold-profile.spec.ts) deliberately does not assert a latency budget from a profiled run.

After the unprofiled cohort, a separate warm open/type/close cycle records CDP CPU samples at 1 ms plus a Blink timeline with invalidation reasons. `NavigationStart`, CDP timestamp and browser monotonic clocks delimit the diagnostic input window. Matching source maps map frames back to React DOM, cmdk, Radix Presence, Motion and MusArt search sources.

The diagnostic hot paths include DOM `appendChild`/`removeChild`/`insertBefore` during React commits, Radix presence style queries, cmdk `scrollIntoView`, focus and result ranking/allocation. Rendering the editor is not implicated by its measured counters. The updated source isolates query state, retains rows, bounds ranking work, removes redundant fuzzy filtering and per-row Motion work, and avoids an opaque panel's inherited backdrop blur. Mount/unmount and browser style/layout work remain visible. Invalidation tracing greatly inflates DOM costs; its self-time values are **diagnostic attribution only**, and are excluded from every timing table above.

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

Apply the scope and priority limits above to the build and browser commands. The baseline steady-state cohort passed two tests in 43.8 seconds and its separate post-edit case passed in 6.2 seconds. The final cohort passed all three tests in 55.9 seconds. Production builds passed in 8.71 seconds each. Both preview processes were stopped after measurement.

Ignored `artifacts/cmdk-profile/{baseline,final}` retain raw per-event JSON, counters, hashes, renderer metadata, screenshots, CPU profiles, Blink traces, build/browser logs, host/provenance records, source maps and exact compiled output. `summary.json` contains all raw latency arrays and mapped diagnostic source totals; `post-edit-150.json` retains the edit and input clocks. These files are local evidence, not published repository artifacts.
