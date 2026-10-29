# GPU load protocol — 50 images

## Local fixture

Open `/?benchmark=50&automation=1`. Construction is deterministic: 50 image layers, each with two effects (100 total), five groups, ten masks, rotations/opacities/blend modes, and captions. Document size: 2400 × 1500. Each of the 50 JPEG files in `apps/web/public/benchmark/` is 1280 × 960; ten Unsplash photographs supply five variations/crops each. Files are pinned by SHA-256 in the manifest.

The fixture is a visual contact sheet and a reproducible workload. It does not represent 50 different original photographs. The report records the number of distinct JPEG fingerprints.

## Latest frozen candidate

The eleven-effect integration's isolated legacy workload passes on Chromium
156/Linux/Intel Xe-LPG, 1600 × 1000, DPR 1: cold opening 5,842 ms, decoded PNG
export 2,277 ms, move median/p95 41.4/51.8 ms and effect-update median/p95
47.3/47.8 ms. Source uploads stay at 97, final cache use is 239.85 MiB within
384 MiB, idle/recovery and canonical WebP checks pass, and all instrumented
production readback APIs remain at zero. The runner duration is 17.9 seconds;
it is not the cold-opening boundary. One fresh browser/worker used CPUQuota
200%, MemoryHigh 3800 MiB, MemoryMax 4500 MiB, zero swap and low priority.

These are current workload observations, not matched speedups against older
3,825/2,301 ms samples. A pressure-affected 8,024/13,922 ms diagnostic was retained
and did not reproduce in this isolated run; it is not used as a performance
baseline. Raw data and process limits are archived under
`artifacts/effects-final-cohorts/` with the matching v3 executable/maps.

The separate [eleven-effect photographic witness](../performance/effect-library-load.md)
cycles all new types across the same fifty image layers. Its functional duration,
resource counts and exact durable-recovery checks are documented separately.
[Visible-thumbnail latency](../performance/thumbnail-latency.md) uses its own
matched baseline and generated/dispatch input clocks.

## Measurements and invariants

1. Record browser, OS, viewport, DPR, and WebGPU adapter, including hardware/software classification when available. The current benchmark records vendor `intel` and architecture `xe-lpg`; do not describe it as software Vulkan based on launch flags.
2. Measure cold opening, including local loading/decoding and the first GPU compilation.
3. Wait for a useful frame and capture the contact sheet.
4. Measure warm interactions: moving a layer, changing effect parameters, undo/redo, pan, and zoom. Report median and p95 separately from cold-start cost.
5. Verify that pan/zoom does not reupload sources, moving a layer retains its textures, uniforms change the result without recreating contexts, and the pipeline returns to idle.
6. Export at the requested size and decode the file to verify dimensions, content, and alpha where relevant.
7. Switch/reload several documents and verify that GPU resources stabilize or are released, without accumulating targets or workers.
8. Instrument `GPUBuffer.mapAsync(READ)`, WebGL `readPixels`, and Canvas2D pixel reads **before application loading**. Require zero application GPU → CPU reads during composition and export. Pixel checks in tests use their own validation canvas, after isolating production counters.

Input → two requestAnimationFrame callbacks measures browser-side processing/presentation latency, not certified GPU duration. No universal FPS threshold is claimed without device and workload context. A software-rendered CI run can establish behavior and invariants when that backend is actually recorded; the final feel on a physical trackpad must be checked on the target machine. Headless Chromium with Vulkan must not be labeled software-rendered unless adapter evidence establishes that classification.

The native selection suite records the first cold click before warming controls, then waits for real visible thumbnails before separate warm samples. Browser event timestamps and presentation timestamps delimit each click, select-all, movement and release. Reports preserve CDP `NavigationStart` and `Timestamp` alongside the browser clock, so CPU-profile samples can be mapped to those input windows instead of attributing a whole select/move/undo recording to release alone. Bulk release reports both the driver round-trip duration and pointer-up → canonical rendered-revision presentation; diagnostic full-document snapshots run outside those measured windows. Threshold failures remain in the reports and fail the corresponding browser checks.

`pan-presentation.spec.ts` exercises AFTERHOURS with rulers, guides and selection visible. CDP sends native wheel or held-pointer inputs at a requested 120 Hz cadence; reports retain the actual delivered count because Chromium can coalesce inputs. Samples separate event → dispatch delay, handler → requestAnimationFrame, frame gaps and a second-RAF post-paint opportunity, while checking computed board poses and real React/GPU/readback counters. Diagnostic runs with `MUSART_PAN_TRACE=1` additionally capture Blink layout/style invalidation and must be kept separate from non-tracing latency results.

Each pan cohort includes a separate minimal retained-DOM control page in the same browser/context and viewport, using the exact same native producer and non-passive `preventDefault()` handler. The control is closed and the editor brought to the foreground before its measurements. One Chromium 156 control with no editor, React, storage or rendering-engine work measured 26.4 ms p95 from generated timestamp to RAF, including 25.7 ms before dispatch; that control alone exceeded the earlier absolute 25 ms target. This protocol overhead varies between cohorts. Reports preserve every raw timestamp, the full control samples and an explicit `rawInput25msExceeded` flag rather than claiming that target was met. Historical failures remain archived.

Wheel gates require capture → RAF p95 ≤ 25 ms **and** generated timestamp → RAF p95 no more than 5 ms above its same-cohort control. The second guard also catches application work that creates a backlog before dispatch; capture latency alone would have missed the original SVG/style regression. These are comparisons of distributions, not causal per-event overhead, INP or certified physical presentation latency. A coalesced wheel event can describe an older native packet. Hand input retains its absolute generated timestamp → RAF limit of 25 ms; frame p95 ≤ 25 ms, maximum gap ≤ 50 ms, post-paint opportunity ≤ 50 ms, zero long tasks and all resource/React/readback invariants remain unchanged.

The verified steady-state pan cohort used Chromium 156 on Linux, 1600 × 1000, DPR 1, with adapter vendor `intel`/architecture `xe-lpg`. AFTERHOURS wheel p95 was 26.5 ms raw against its 23.2 ms control (distribution difference 3.3 ms), with capture → RAF 1.0 ms; the raw absolute 25 ms flag remained true. Hand p95 was 4.8 ms raw. Both modes had frame p95 16.7 ms, maximum gap 16.8 ms, zero long tasks, unchanged five editor React counters, no GPU resubmission/upload and zero JavaScript pixel readbacks. The text-frame, collective-guide, control and pan native cases passed 4/4. Full reports and captures remain under ignored `artifacts/pan-stability-final/`. This idle/cohort result does not establish responsiveness while a bulk commit's journal, accounting or autosave work is still pending; immediate follow-up input requires its own measured workload.

## Consulted documentation

- [WebGPURenderer](https://threejs.org/manual/pages/webgpurenderer)
- [Renderer.info](https://threejs.org/docs/pages/Renderer.html#info)
- [R3F on-demand rendering](https://r3f.docs.pmnd.rs/advanced/scaling-performance)
- [GPUBuffer.mapAsync](https://developer.mozilla.org/en-US/docs/Web/API/GPUBuffer/mapAsync)

API notes are preserved in [three-webgpu.md](three-webgpu.md) and [tsl.md](tsl.md).
