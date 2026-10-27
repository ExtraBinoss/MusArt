# GPU load protocol — 50 images

## Local fixture

Open `/?benchmark=50&automation=1`. Construction is deterministic: 50 image layers, each with two effects (100 total), five groups, ten masks, rotations/opacities/blend modes, and captions. Document size: 2400 × 1500. Each of the 50 JPEG files in `apps/web/public/benchmark/` is 1280 × 960; ten Unsplash photographs supply five variations/crops each. Files are pinned by SHA-256 in the manifest.

The fixture is a visual contact sheet and a reproducible workload. It does not represent 50 different original photographs. The report records the number of distinct JPEG fingerprints.

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

## Consulted documentation

- [WebGPURenderer](https://threejs.org/manual/pages/webgpurenderer)
- [Renderer.info](https://threejs.org/docs/pages/Renderer.html#info)
- [R3F on-demand rendering](https://r3f.docs.pmnd.rs/advanced/scaling-performance)
- [GPUBuffer.mapAsync](https://developer.mozilla.org/en-US/docs/Web/API/GPUBuffer/mapAsync)

API notes are preserved in [three-webgpu.md](three-webgpu.md) and [tsl.md](tsl.md).
