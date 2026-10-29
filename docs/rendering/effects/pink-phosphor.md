# Pink Phosphor

Pink Phosphor is an artistic three-color emission treatment: dark purple shadows,
pink midtones and pale highlights. Exposure, gamma and contrast shape authored
luminance. A bounded five-tap weighted cross adds local highlight glow; an authored
scanline beam, deterministic grain and explicit phase flicker finish the result.
These settings are portable and their uniforms retain identity during editing.

The visual primary reference is Three r186's
[official WebGPU bloom example](https://threejs.org/examples/webgpu_postprocessing_bloom.html)
and its [official static screenshot](https://github.com/mrdoob/three.js/blob/r186/examples/screenshots/webgpu_postprocessing_bloom.jpg).
The inspected screenshot shows bright colored cores surrounded by weaker halos
against a nearly black background. That hierarchy guides the treatment; the pink
palette is an authored aesthetic. The reference image is retained for local
comparison under ignored `artifacts/pink-phosphor/` and is not shipped as an asset.

[GPU Gems chapter 21](https://developer.nvidia.com/gpugems/gpugems/part-iv-image-processing/chapter-21-real-time-glow)
describes extracting bright sources and spreading their contribution with a
filter. MusArt uses a single-pass five-sample cross approximation, rather than
that chapter's full multipass Gaussian bloom. It is local, may show directional
structure at large reach, and does not claim calibrated optical or HDR bloom.
The [W3C's historical sRGB discussion](https://www.w3.org/Graphics/Color/sRGB)
also distinguishes electronic tone transfer from phosphor color. The gamma
control here is artistic, not a measured monitor calibration.

All source samples pass through the shared orientation-aware sampler. Glow energy
is weighted by source alpha before accumulation, preventing transparent neighbors
from emitting light. The original per-pixel source alpha is retained, so glow
stays within the source silhouette. No feedback texture, expanding coverage,
physical persistence or historical afterglow is simulated. Time is explicit;
grain and flicker use `time × speed`, with no wall clock or frame counter.
Speed zero is stationary. No resource, atlas, timer, listener or CPU image buffer
is allocated by the effect. Pixel pitch and glow reach use authored dimensions,
and the shared reference plane handles editor/thumbnail/export density.

Mirrored tests cover validated settings, undo/redo, alpha ownership and stable
uniforms. The frozen 2026-10-28 native run of
`test/browser/pink-phosphor-effect.spec.ts` passes both backends in 9.3 seconds on
Linux, Headless Chrome 156.0.8078.4, viewport 1600×1000 and DPR 1.25. WebGPU reports
Intel Xe-LPG; the actual WebGL fallback is checked without claiming an adapter
query. One worker uses a 200% CPU scope, a 2300 MiB memory high watermark, 3200 MiB
hard limit and zero swap allowance. These are functional checks, not GPU timings.

The real photograph retains 102 decoded alpha levels with zero maximum alpha
error, including fractional coverage. Explicit phase, seed, speed-zero stability,
amount zero, alternate palette, tone transfer, extreme settings and the disabling
glow threshold all pass. Full-strength scanlines produce a red-channel row range
of 107 bytes on a uniform gray source. A bright-bar witness measures a white core
`[255,255,255]`, pink halo `[47,13,42]` and dark background `[16,4,22]`; the same
glow does not expand a transparent silhouette.

The native contact sheets were inspected against Three's official screenshot.
The photograph has the intended pink/pale emission hierarchy and visible scanline
texture. The bar witness has a narrow local pink halo, while Three's reference
has a broader smooth optical-style halo. This expected approximation difference
is retained explicitly; there is no pixel-equality claim against that artwork.
Native editor snapshots and same-backing exports are RGBA-identical at scales
0.625×/1×/2×, with physical requests 0.625×/1×/1.5× under the existing quality-tier
policy. Production WebGPU, WebGL and Canvas2D readback counters remain zero. Raw
metrics and PNGs are stored under ignored `artifacts/pink-phosphor/`.

The v3 [seed/time precision regression](seed-time-precision.md) adds a large-seed grain witness with flicker disabled. Grain frames at 1/30 and 2/30 seconds now change independently at seed 2³⁰ and exactly match integer seed+1/seed+2 at time zero. The seed and frame combine in unsigned arithmetic; flicker reduces cycles before its sine. A 24-hour integer-cycle flicker frame exactly matches time zero. All old captures remain archived, and these are correctness results rather than speed measurements.
