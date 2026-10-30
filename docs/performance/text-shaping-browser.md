# Native text-shaping comparison

Three production-browser observations per method are complete. They do not
demonstrate a faster cold first usable canvas. The warm edit and native export
medians were descriptively lower, within substantial overlapping variation.
The separate repeated CPU preparation benchmark has a lower median; it is a
different boundary from opening or exporting the application. CPU results and
compatibility fingerprints are recorded in [text shaping](text-shaping.md).

Both methods use the same interface from before the Melt rebranding. The later
SVG mascot, branding assets and loading marks are outside these frozen builds.
The payload and application timings therefore describe the isolated text
migration, rather than the complete branded application's download size.

## Frozen execution and workload

The baseline is `a40285b8f32f99778219cd9bcc55b8ae694c0edc`, with HarfBuzz.js
0.4.15, OpenType.js 2.0.0, the verified analytical Three/TSL renderer, and the
same UI/density behavior used for the candidate. A detached worktree has its
own frozen Bun installation and workspace links to its own packages. The later
`3ac0ae7` commit changes tests only and is not the measured source identity.

The deterministic 1600×1500 document contains 150 editable text layers, fifteen
per bundled family: Inter, Tinos, Space Grotesk, Roboto Mono, Manrope, DM Sans,
Lora, Playfair Display, Caveat and Arimo. The fixture uses real French/English
text, accents, kerning/ligature pairs, wrapping, alignment, negative tracking,
alpha and gradients. Its serialized SHA-256 is
`072ff7c5fe9f4f5b1852d2cf7cfcfe6a9c173385d5f55e61b38aa8908c940ad0`.
Families are grouped in fifteen-layer runs so the existing five-idle-face limit
does not turn the fixture into repeated artificial font-cache churn.

Each observation launches a new Playwright/Chromium process and fresh browser
context. Network caches are explicitly cleared and disabled. Three observations
per method use the same order: bootstrap, load the real document, first
canonical draw plus two RAF opportunities, settle thumbnails, produce a native
PNG, then commit a text edit to the final fifteen already-warm Arimo layers.
The edit is checked and restored with one undo. OS/file/driver caches are shared
on the host; these are not isolated-machine trials or statistical estimates.

The production build alone receives an identical measurement-only Vite
pre-transform at three preparation boundaries. `FontRepository.prepare` records
fetch/parse/shaper wall time; `TextSources.prepareLayer` also records the
synchronous layout/curve interval after acquiring the font;
`TextSources.prepare` includes source work and any awaited GPU preparation.
Original source mappings remain intact through insertion-only MagicString maps.
No measurement hook is added to the production application source.

The measurements observe all actual renderer instances, including background
thumbnails. Their intervals can overlap; sums are workload totals, not exclusive
foreground CPU time or an additive decomposition of canonical latency. A DOM
MutationObserver records the actual canonical revision after the renderer's
draw. RAF timestamps indicate browser presentation opportunities, not GPU
duration or physical display timestamps. No document snapshot or Playwright
trace is collected inside the measured intervals.

The report also retains navigation-relative absolute clocks, complete native
Navigation/Resource Timing entries and observed automation readiness. The
navigation-to-canonical total includes bootstrap and the driver's gap before
loading the fixture. Automation readiness is observed after IPC polling rather
than claimed as an exact application-assignment timestamp. Together with actual
JS/WASM payload/startup records, these boundaries prevent a library's moved
module cost from being mistaken for a general cold-start gain.

## Environment

- Chromium 156.0.8078.4, Linux 7.2.8-200.fc44.x86_64, viewport 1600×1000, DPR 1.
- Actual canvas backend: WebGPU; requested adapter reported Intel `xe-lpg`,
  `isFallbackAdapter=false`. Device/driver identifiers were not exposed.
- Fit drawing buffer: 896×840 in all three baseline observations.
- One serial worker. Each runner and its browser children use CPUQuota 100%,
  MemoryHigh 1800M, MemoryMax 2200M, MemorySwapMax 0, nice 15 and ionice 2/7.
  The immutable preview server is idle outside that scope.
- Production preview used port 6208; compiled JavaScript and full matching maps,
  plugin/config/harness copies and file hashes are retained under
  `artifacts/text-shaper-migration/baseline/`.

## Baseline observations

All values are milliseconds. Canonical times start immediately before the real
validated load/edit command and end at the matching drawn revision. They include
application publication, font resolution, CPU preparation, GPU scheduling and
normal concurrent application work.

| Boundary                                                    |    Run 1 |    Run 2 |    Run 3 |
| ----------------------------------------------------------- | -------: | -------: | -------: |
| Navigation → observed automation readiness                  |  1,307.1 |  1,327.7 |  1,190.2 |
| Navigation → canonical document draw                        | 12,895.0 | 14,307.0 | 11,290.8 |
| Navigation → document's second RAF                          | 12,911.7 | 14,381.1 | 11,309.2 |
| Cold load → canonical draw                                  | 11,193.8 | 12,714.3 |  9,896.7 |
| Cold load → second RAF                                      | 11,210.5 | 12,788.4 |  9,915.1 |
| Warm fifteen-layer text edit → canonical draw               |    946.4 |    801.5 |    603.8 |
| Warm edit → second RAF                                      |  1,047.4 |    898.7 |    609.1 |
| Separate native PNG preparation/encoding                    |  7,160.3 |  6,772.3 |  5,448.4 |
| Cold font-prepare interval sum, including concurrent owners |  3,179.9 |  5,421.3 |  5,290.7 |
| Cold layout/curve interval sum, including concurrent owners |  1,630.4 |  1,699.9 |    785.3 |

Cold preparation observed 11/13/15 font loads and 158/160/162 layer preparations,
covering all 150 document IDs. The varying additional work belongs to other real
renderer instances. Warm edits caused no new font preparations. Do not interpret
the interval sums as a microbenchmark of either shaping library.

All three PNGs decode to 1600×1500 with nonempty ink in every authored cell and
the same delivered-image fingerprint, `708511341`. Canonical canvas statistics
were identical: 150 source uploads, 153 targets and 21,862,196 cache bytes. Warm
edits added fifteen source uploads and retained 22,829,096 bytes. These are below
the unchanged 384 MiB hard cache. The five React counters were recorded; the warm
committed edit changed Inspector once and changed App, CanvasArea, EditorCanvas
and EditorScene zero times. A committed edit is not a continuous-preview test.

Actual read APIs were instrumented before navigation: all WebGPU buffer reads,
WebGL pixel reads, Canvas2D pixel reads and VideoFrame copies remained zero in
the application. Decoding/inspecting exported PNGs happens in a separate page
after timing, outside those production counters.

Each baseline loaded thirteen JavaScript responses totaling 1,310,576 encoded
body bytes, one HarfBuzz WASM response of 366,811 bytes, and ten TTF responses
totaling 3,536,240 bytes. These are actual fetched bodies, not all build chunks.
WASM instantiate/Module hooks recorded the real first-use operations. They are
operation records, not separate unique module counts.

## text-shaper observations

The candidate uses text-shaper 0.1.28 with the explicit
[compatibility/cache patch](../../patches/README.md). The installed bundle
SHA-256 is `43746f6e9885b317347d700464786050c38577550eb1c092a3751bcde9547867`.
Its detached worktree starts at test-only commit
`3ac0ae759a54020abdec393fc23999235f779866` plus the recorded binary source diff
and 27 untracked source/support files. The runtime-source manifest SHA-256 is
`8c869ce5ab267a89782735030ea30512298c85d0f05f6c77fc4b9b3037ded8f5`.
All 843 runtime files remained unchanged through the production build, three
observations and eight additional native checks; all 21 available font files
match the baseline bytes. The source diff, untracked file copies/hashes and
independent frozen dependency installation are retained with the compiled
JavaScript and maps under `artifacts/text-shaper-migration/candidate/`.

The exact same frozen Vite measurement plugin and browser harness were used
for both methods. No additional runtime tuning or favorable-run selection was
performed after these three candidate observations.

| Boundary, milliseconds                                      |    Run 1 |    Run 2 |    Run 3 |
| ----------------------------------------------------------- | -------: | -------: | -------: |
| Navigation → observed automation readiness                  |  1,346.4 |  1,302.9 |  1,377.8 |
| Navigation → canonical document draw                        | 13,501.7 | 13,270.7 | 12,090.1 |
| Cold load → canonical draw                                  | 11,805.3 | 11,693.1 | 10,488.8 |
| Warm fifteen-layer text edit → canonical draw               |    997.8 |    743.2 |    632.2 |
| Separate native PNG preparation/encoding                    |  7,292.1 |  6,363.4 |  6,075.8 |
| Cold font-prepare interval sum, including concurrent owners |  5,015.7 |  4,627.3 |  5,063.5 |
| Cold layout/curve interval sum, including concurrent owners |  1,688.3 |  1,440.4 |  1,698.1 |

Cold preparation observed 12/12/14 font loads and 159/159/161 layer preparations,
including normal background work, with all 150 authored IDs covered. Warm edits
again caused no new font preparations. The individual preparation intervals
and both RAF clocks remain in every raw report.

| Native boundary                          | Baseline median | Candidate median | Descriptive change |
| ---------------------------------------- | --------------: | ---------------: | -----------------: |
| Navigation → usable canonical document   |     12,895.0 ms |      13,270.7 ms |              +2.9% |
| Load command → canonical draw            |     11,193.8 ms |      11,693.1 ms |              +4.5% |
| Warm fifteen-layer edit → canonical draw |        801.5 ms |         743.2 ms |              −7.3% |
| Native PNG preparation/encoding          |      6,772.3 ms |       6,363.4 ms |              −6.0% |

Three shared-host observations, sequential old/new ordering and shared OS/driver
caches do not establish a causal or universal speedup. In particular, the
separate CPU median reduction must not be advertised as a 29% faster first
opening or a 29% faster export. New cold variable-font parsing/setup remains a
cost documented by the CPU report.

The candidate fetched twelve JavaScript responses totaling 1,459,120 encoded
body bytes: 148,544 more JavaScript bytes than the baseline. It fetched no WASM
and recorded no JavaScript Module-construction/instantiate/instantiateStreaming
operations. Combined JS+WASM encoded bodies fell from 1,677,387 to 1,459,120 bytes,
a reduction of 218,267 bytes (13.0%) in this scenario. Ten TTF responses remained
identical at 3,536,240 bytes. The package's unused optional raster paths are not
used to prepare or render these glyphs; this is measured first-use payload,
not a claim about every optional dependency export.

GPU work remained comparable: all three candidate observations used the same
896×840 fit buffer, 150 initial source uploads, 153 targets, 303 passes and
15 node programs. Candidate cache occupancy was 21,858,100 bytes initially and
22,825,000 after the fifteen new uploads. Warm React counter changes were the
same as baseline: Inspector +1 for the committed edit, the other four roots +0.
Actual application read APIs remained zero throughout, and a single undo
restored the authored document.

## Delivered pixels and native interaction

All six exports decode to 1600×1500 with real ink in every one of the 150 cells.
Within each method, all three decoded RGBA SHA-256 fingerprints are identical.
The two methods are not bit-identical: 23,381 of 2,400,000 pixels differ (0.97%),
with mean absolute RGBA channel difference 0.144 on the 0–255 scale and a maximum
channel difference of 230. Tinos and default-weight Roboto Mono match exactly;
the eight non-default variable-family groups contain the differences.

The old-output bit comparison is descriptive. The independent FreeType outline
bounds investigation in the CPU report identifies incorrect old composite
variation bounds; it does not attribute every changed pixel automatically to
that one defect. Correctness is also checked against independent original
outlines and renderer invariants. The eight additional real-browser checks
all passed on the same immutable candidate production preview:

- Two FontPicker cases verify native hover/keyboard preview, cancellation,
  actual presentation readiness, one undo, and real TTF import/save/reload.
- Two dilation cases verify subpixel coverage at low density and both pixel
  phases, independently on WebGPU and WebGL fallback.
- Two outline cases compare large straight and diagonal glyph interiors and
  exterior transparency with the original font paths on both backends.
- Two complete rendering cases verify curves, counters, alpha, gradients,
  tracking, weights, kerning, accents, masks, effects, blending and sharp native
  exports on both backends.

The eight-case command exited zero in 3.7 minutes. Its config, JSON report,
captures and log are retained as `native.config.ts`, `native-results.json`,
`native/` and `native.log` under `artifacts/text-shaper-migration/`.

## Reproduction and retained failures

Use the serial/frozen-build protocol in [protocol.md](protocol.md). The ignored
`artifacts/text-shaper-migration/browser.config.ts` targets one immutable preview
and disables Playwright trace snapshots. The reusable scenario, fixture,
imperative probe and measurement-only Vite plugin are checked in under
`test/performance/text-shaper/`, outside the ordinary browser gate. Point an
explicit Playwright configuration at that directory and provide
`MUSART_TEXT_OUTPUT`, `MUSART_TEXT_URL`, `MUSART_TEXT_SHA`, `MUSART_TEXT_METHOD`
and `MUSART_TEXT_RUN`; launch one fresh process for each of runs 1–3.
The exact measured harness is additionally preserved with the
build, and each `baseline/browser-{1,2,3}/` contains raw preparation measures,
phase clocks, full environment/resource counters, decoded-image checks, both
PNG captures and the exact browser log. `build-manifest.json` retains JS/map/WASM
hashes; `measurement-provenance.json` records the source and plugin identity.

Two preliminary harness diagnostics are retained separately and excluded from
the three observations. `setup-revision-mismatch` compared the engine revision
with the renderer's internal generation and was stopped once that mismatch was
identified. `setup-global-mark-count` correctly captured cold/warm frames but
incorrectly expected exactly 150 global preparation events despite background
thumbnails. The final harness checks coverage of the actual 150 IDs and retains
every extra event. The initial Vite plugin setup failure is retained too. No
timeout was raised and no failing application render was counted as success.
Preliminary candidate CPU trials that exposed script selection, positioning
and setup costs remain separately retained by the CPU investigation. They are
not substituted for the final three observations above. Both preview servers
were stopped after verification; the user's development server on 6200 remains
available. The compiled builds and all raw artifacts were preserved.
