# Gradient shader ports

MusArt exposes one **Gradient** effect. Its portable settings select a field,
a treatment and finishing options; they do not create separate catalogue entries.
Existing standalone ASCII, Dither, Grain and Vignette effects remain compatible.

## Provenance

The field and treatment equations were ported from the user's local
`Plinka/React-Beautiful-Gradient` repository, `packages/webgl/src/shaders.ts`,
`stripes.ts`, `effects-shaders.ts` and `compositing.ts` (ExtraBinoss / Plinka,
2026, MIT). The original license is retained in
[plinka-gradient-MIT.txt](../legal/plinka-gradient-MIT.txt).
No GLSL string is evaluated or compiled by MusArt. These are typed Three.js TSL
node graphs consumed by Three's WebGPURenderer and its WebGL fallback.

| Source          | MusArt implementation                                   | Rendering                                                       |
| --------------- | ------------------------------------------------------- | --------------------------------------------------------------- |
| Mesh            | `effects/gradient/variants/mesh`                        | Six bounded weighted color centers                              |
| Silk            | `effects/gradient/variants/silk`                        | Sinusoidal fabric folds and lighting                            |
| Aurora          | `effects/gradient/variants/aurora`                      | Modulated luminous curtain                                      |
| Liquid          | `effects/gradient/variants/liquid`                      | Warped liquid pools                                             |
| Radial          | `effects/gradient/variants/radial`                      | Periodic radial color bands                                     |
| Waves           | `effects/gradient/variants/waves`                       | Displaced colored ridges                                        |
| Stripes         | `effects/gradient/variants/stripes`                     | EasyDocs noise-warped curtains                                  |
| ASCII           | Existing `effects/ascii`                                | Existing bounded 16-glyph atlas                                 |
| Dither          | Existing `effects/dither`                               | Existing deterministic Bayer 4×4 quantizer                      |
| Blocks          | `effects/gradient/treatments/blocks`                    | Premultiplied four-cell interpolation, bevel, gaps and rounding |
| Glass           | `effects/gradient/treatments/glass`                     | Refraction, bounded five-tap blur, dispersion and frost         |
| Folds           | `effects/gradient/treatments/folds`                     | Triangular/cosine fold displacement and directional shading     |
| Finishing       | `effects/gradient/finish`                               | Chromatic displacement, grain, vignette and rounded coverage    |
| Blend/composite | Shared typed blend registry and effect compositing node | 26 blend modes and 13 opt-in Porter-Duff operations             |

The ASCII and Dither treatments intentionally reuse MusArt's existing operators;
the upstream arbitrary ASCII alphabet, custom foreground/background, Bayer 8×8
and random-dither controls are not claimed as implemented. Integer hashes replace
the upstream floating-point hashes to keep fixed-time output reproducible across
WGSL and GLSL. Stripes' static grain is applied by the shared finishing stage.
Preset names, bounded control ranges and palette roles are retained or adapted
from the upstream catalogue. Nine curated presets include Silk, Aurora, Chrome,
Pearl, Stripes, Daydream, Ultraviolet, Tidal and Citrus.

Darker Color and Lighter Color select an entire RGB triplet using its channel
sum, retaining the backdrop on ties. This follows
[Adobe's blend-mode specification](https://helpx.adobe.com/ee/photoshop/desktop/repair-retouch/adjust-light-tone/blending-mode-descriptions.html),
rather than the borrowed repository's luminosity approximation. The remaining
separable and component blend functions use the existing W3C/Photoshop registry.

## Texture ownership and compositing

A Gradient runs a field pass, optionally a treatment pass, and a finishing pass.
A shared scratch target supplies ping-pong rendering. When a preceding effect's
result must remain available, a separate lazily allocated GPU backup preserves
its original alpha and color. Every target and the ASCII atlas are charged to
the compositor's hard resource budget before allocation. Original image pixels
and all intermediate textures remain on the GPU. No production JavaScript pixel
readback is involved.

By default an effect replaces the original color while retaining coverage;
its opacity mixes the two in premultiplied alpha. This avoids applying
source-over twice to a semitransparent layer. An explicitly selected Porter-Duff
operation instead uses its documented source/destination factors. A Gradient's
amount additionally scales its overall effect opacity. Layer blend mode remains
a separate composition step.

Document time is explicit (`Effect.time`, seconds, default zero). No wall clock
enters composition, export, thumbnails or replay. The bounded periodic clock,
seed and settings therefore reproduce the same frame. Pixel treatment sizes,
grain size and corner radii follow export density; field scale stays normalized.

## Loading presentation

Before R3F exists, Studio renders a CSS-only startup placeholder. It does not
claim to run a GPU shader while CPU initialization is in progress. Once an editor
renderer exists, a neutral CSS glow covers the display plane while a composition
prepares. The actual first texture draw triggers a short bottom-to-top blur
reveal using CSS, without another renderer, GPU loader or JavaScript animation
loop. There is no minimum loading duration. Reduced motion skips the reveal.
The display material remains a direct texture sample and ordinary demand
rendering remains unchanged. Page changes retain the same R3F scene and renderer.
Silk remains available as a document Gradient style, at an explicit fixed time.

Unit tests cover parameter bounds, preset edits, immutable metadata, resource
budgets, backing texture ownership, stable uniforms and presentation cleanup. Native
browser tests decode delivered PNGs in a separate inspector page for all fields
and treatments on both backends, and instrument real production read APIs.
Measurements and verified results belong in the release changelog and ignored
`artifacts/` reports; the existence of a test alone is not a passing result.
