# Layer transition operators

The portable `transition` effect uses one selected Three.js TSL operator. Incoming
animation runs progress from 0 to 1; outgoing animation reverses the same progress.
No operator reads a wall clock, animation frame counter or raster-density uniform.

| Module        | Distinct operators                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `fade.ts`     | Fade, fade through black, fade through white                                                                        |
| `reveal.ts`   | Directional, diagonal, angular, circular and diamond reveals                                                        |
| `patterns.ts` | Blinds, checkerboard, growing grid, source luminance and deterministic dissolve                                     |
| `move.ts`     | Slide, zoom, spin, perspective flip, hinged doorway and elastic squeeze                                             |
| `distort.ts`  | Swirl, radial ripple, planar wave and mirrored kaleidoscope                                                         |
| `stylize.ts`  | Pixelation, nine-tap defocus, RGB separation, progress-quantized glitch, organic ink, halftone and scattered mosaic |

`registry.ts` checks all 30 portable style IDs. `pipeline.ts` caches one immutable
stage descriptor per style. Selecting a style happens in JavaScript before shader
construction; the shader does not contain a 30-way operator dispatch. Numeric
edits only update existing uniforms. `GpuEffects` uses the shared stage resolver
for preparation, allocation accounting and actual preview/export drawing.

The endpoint wrapper returns the exact input sample at progress 1 and transparent
RGBA at progress 0 with the default amount. Strength 0 uses a simple fade. The
standard effect amount, opacity, blending and explicit compositing remain active.
Uniform endpoint branches skip the selected operator's expensive work at rest.

Coordinates outside the source return transparent samples. The wrapper caps
processed alpha by the original alpha, preserving the core `coverage: reduce`
contract for masks, text and transparent images. Movement is inside the layer's
existing effect surface; moving the layer's geometry uses transform keyframes.
Defocus uses nine source samples including the shared center, with premultiplied
averaging. Other operators use at most four samples including the shared original,
before standard compositing.
Noise uses the existing integer hash and a stored effect seed.

The focused 14-file unit batch passed 59 tests. It verifies all operator graphs,
bounded sampling, parameter identity, complete typed dispatch, one-pass allocation
and selected-material reuse. Focused formatting, ESLint, type-aware Oxlint and
strict TypeScript also passed. This is graph and lifecycle evidence; native
WGSL/GLSL compilation and decoded endpoint/intermediate PNG checks remain the
separate browser gate coordinated by the parent agent.
