# One-bit Dither

One-bit Dither is a separate two-color effect. Existing multilevel Dither documents
retain their current operator. The new effect samples luminance at authored cell
centers, applies contrast and tone gamma, and chooses an ink or paper color using
a fixed threshold, Bayer 2×2/4×4/8×8 ranks or interleaved gradient noise. Threshold,
dither strength, palette and inversion remain explicit portable settings.

The Bayer ranks follow the standard recursive dispersed-dot construction. Each
rank is centered in one of N² equal threshold bins, using `(rank + 0.5) / N²`.
[ImageMagick's primary threshold maps](https://github.com/ImageMagick/ImageMagick/blob/main/config/thresholds.xml)
document these dispersed-dot Bayer families. MusArt keeps the same 2×2 base
orientation at all three sizes and uses centered-bin normalization; ImageMagick's
8×8 example is transposed and uses a different endpoint normalization.
[Ulichney's review](https://cv.ulichney.com/papers/2000-halftoning-review.pdf)
distinguishes periodic threshold maps, error diffusion and blue-noise masks.

Interleaved mode directly uses Three's existing `interleavedGradientNoise` TSL
operator, derived from
[Jorge Jimenez's SIGGRAPH 2014 presentation](https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare/).
It is a deterministic high-frequency interleaved pattern. It is not labeled as a
void-and-cluster blue-noise mask or Floyd–Steinberg error diffusion. The seed
translates cell coordinates; no frame clock or output density enters the pattern.

All work is bounded, one-pass Three.js TSL. No texture atlas, image synthesis,
worker, timer, GPU readback or persistent resource is added. Spatial coordinates
and cell size use authored layer pixels; the common reference plane governs
editor, thumbnail and export reduction. Source alpha is retained per pixel rather
than replaced by cell-center coverage. At full amount each reference texel chooses
one palette color; minification and fractional coverage can naturally blend those
colors in the final image.

Mirrored tests cover defaults, validation, immutable data, command undo/redo,
uniform identity and original alpha. The frozen 2026-10-28 run of
`test/browser/bit-dither-effect.spec.ts` passes both native backends in 9.9 seconds.
It uses Linux, Chrome 156.0.8078.4, viewport 1600×1000 and DPR 1.25; WebGPU reports
Intel Xe-LPG. The WebGL fallback is verified from its actual backend and does not
claim an independently queried adapter. One worker uses a 200% CPU scope, 2300 MiB
memory high watermark, 3200 MiB hard limit and zero swap allowance.

All five photograph modes are distinct, deterministic and strictly two-color on
opaque reference pixels. All 102 source alpha levels are retained with zero
maximum alpha error. Palette, inversion, gamma/contrast, high seed bits, amount
zero and dither-strength zero assertions pass. Visual contact sheets show the
fixed threshold, three Bayer scales and interleaved pattern separately.

An independent CPU oracle checks all 16,384 threshold/Bayer ramp pixels per mode
without errors. The IGN comparison excludes only 32 samples within a predeclared
0.001 distance of its discontinuous floating-point threshold; all other 16,352
samples match. This margin is reported rather than presented as exact CPU/GPU
agreement at the boundary. Native editor canvas and matching-density exports are
RGBA-identical at backing scales 0.625×/1×/2×, corresponding to physical requests
0.625×/1×/1.5× under the existing quality-tier policy. Production readback counters
remain zero. The command, decoded PNGs and raw reports live in ignored
`artifacts/bit-dither/`; these are functional checks, not GPU timing claims.
