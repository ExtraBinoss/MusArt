# GPU transition pack

The user confirmed layer entry or exit on 2026-10-30: “euh bah entrée ou sortie tu peux choisir.”
This pack does not introduce a second timeline or a separate transition renderer.

## Authoring and deterministic time

| Concern      | Contract                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------- |
| Placement    | Enter or Exit, chosen per layer, including isolated groups                                   |
| Catalog      | 30 distinct operators in five categories; definitions are portable TypeScript                |
| Stored form  | A normal `transition` effect and two `settings.progress` keyframes                           |
| Enter        | Progress 0 at the clip's start, 1 after the chosen duration                                  |
| Exit         | Progress 1 before the clip's end, 0 at its end                                               |
| Duration     | A positive exact rational interval contained in the clip                                     |
| Easing       | The ordinary keyframe easing editor; UI initially uses Ease in/out                           |
| Resting base | Progress 1: switching to Static preserves the base design                                    |
| History      | The effect and both keys are one validated command and one undo                              |
| Re-edit      | All effect settings remain available in Properties; progress keys are ordinary timeline rows |
| Replacement  | An explicit effect ID replaces only that transition's progress channel                       |
| Stacking     | Entry and exit can coexist as two effects; both retain group/mask semantics                  |

The layer-row action opens a compact popover with Enter/Exit, category, operator
and duration. Choosing options edits only a local draft. Apply checks the exact
project reference, revision and artboard ID; a same-ID reload cannot apply an old
draft. Cancel and empty clicks do not mutate the document. The common Select
provides the existing predictable-height list, controls, scrollbar and ScrollShadow.

## Categories

| Category   | Operators                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| Fade       | Fade, through black, through white                                                                                        |
| Reveal     | Directional wipe, diagonal wipe, clock wipe, iris, diamond, blinds, checkerboard, grid reveal, luminance reveal, dissolve |
| Movement   | Slide, zoom, spin, flip, doorway                                                                                          |
| Distortion | Swirl, ripple, wave, squeeze, kaleidoscope                                                                                |
| Stylized   | Pixelate, defocus, RGB split, glitch, ink, halftone, mosaic                                                               |

These are separate spatial, sampling or coverage operators, rather than thirty
names for different easing curves. Easing is independent of the selected operator.

## Rendering and resource limits

The render registry selects a single TSL builder in JavaScript. Its material key
includes the operator ID. A draw never evaluates thirty possible shader branches.
Each operator is one effect pass, using the existing pooled surfaces and shared
Three.js WebGPURenderer, including its WebGL fallback. Source/intermediate pixels
remain GPU textures. The ordinary effect compositor still owns blending/opacity.

At progress 0 the raw operator produces transparent black; at progress 1 it
returns the exact original sample. Default amount/opacity keep those endpoints
unchanged. Deliberately customized compositing follows the existing effect rules.
Warped coordinates have explicit coverage rather than exposing clamp-to-edge
pixels. Procedural patterns use authored inputs and seeded hashes, never wall
time or random CPU calls. Multi-sample treatments have a fixed small sample bound.

Preview and Mediabunny export consume the same evaluated composition and effect
graph. No production pixel readback, CPU bitmap effect or extra rendering framework
is introduced. Parameter changes update uniforms; changing the operator selects
its bounded cached pipeline. Initial compilation and warm interaction are measured
separately before performance claims.

## Verification checklist

- [x] Headless catalog uniqueness and validation of all 30 IDs.
- [x] Headless command, rational endpoints, arbitrary seek order, serialization,
      Static base, undo/redo and failed-transaction checks.
- [ ] UI category/operator selection, duration, cancellation and stale-origin checks.
- [ ] TSL graph construction and bounded sampling for all operators.
- [ ] Native WebGPU and WebGL rendered endpoints, interior differences and alpha.
- [ ] Import/play/preview/export integration with original image/video sources.
- [ ] Warm interaction and resource-cleanup measurements on In Bloom and Stress Lab.

Primary implementation references:
[Three.js TSL specification](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language),
[Three.js TSL API](https://threejs.org/docs/pages/TSL.html), and
[Three.js SampleNode](https://threejs.org/docs/pages/SampleNode.html).
