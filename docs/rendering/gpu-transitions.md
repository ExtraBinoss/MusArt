# Deterministic GPU transition operators

The portable `transition` effect provides 30 distinct operators in five categories.
`settings.progress` is a normal numeric Motion property; the same generic
keyframes, easing, renderer and export graph apply. The base value is 1, keeping
the unanimated design visible. Scheduling an entry/exit is a separate authoring
command and interface milestone.

| Family | Operators |
| --- | --- |
| Fade | Fade, through black, through white |
| Reveal | Directional wipe, diagonal wipe, clock wipe, iris, diamond, blinds, checkerboard, grid reveal, luminance, dissolve |
| Movement | Slide, zoom, spin, flip, doorway |
| Distortion | Swirl, ripple, wave, squeeze, kaleidoscope |
| Stylized | Pixelate, defocus, RGB split, glitch, ink, halftone, mosaic |

The [implementation notes](../../packages/render/src/effects/transition/README.md)
explain sampling and alpha. A typed JavaScript registry chooses one TSL builder
before compilation. Material keys include the operator ID; progress changes update
uniforms and reuse the prepared pipeline. The draw contains no 30-way shader
dispatch. Each transition uses one effect pass and existing bounded surfaces.
Defocus uses at most nine samples; other operators at most four. Seeded procedural
patterns never read wall time or random CPU state.

With default amount/opacity/compositing, progress 0 is transparent and progress 1
is the exact source. The existing compositing controls retain their normal meaning.
Transformed coverage cannot expand the source silhouette, preserving masks and
transparent images. Motion outside the layer's surface uses transform keys.

## Native verification on 2026-10-30

| Check | Evidence |
| --- | --- |
| All 30 operators, WebGPU | Five focused Chromium cases passed |
| All 30 operators, WebGL fallback | Five focused Chromium cases passed |
| Exact identity endpoint | Maximum decoded RGBA difference 0 in the recorded cohort |
| Empty endpoint | Sum of decoded alpha 0 for every operator |
| Backward/forward seek | Repeated progress 0.37 produces identical decoded pixels |
| Source coverage | No expanded alpha beyond the source |
| Real image output | Intermediate PNGs contain visible pixels and differ from the source |
| Production-side read APIs | GPUBuffer.mapAsync(READ), readPixels, getImageData and VideoFrame.copyTo all remain 0 |
| Graph/lifecycle unit tests | 59 focused render cases passed before native execution |

The witness uses the actual renderer and browser-owned PNG encoding. A separate
uninstrumented page decodes PNGs for test-only inspection. These inspection reads
are never part of the production editor/render path. Captures and raw reports live
under ignored `artifacts/motion/transitions/native/`.

Chromium 156.0.8078.4 ran on Linux with one worker. Browser and Vite were each capped
at 50% of one logical CPU, with memory/swap bounds. Renderer stats confirm the
requested backend; the physical adapter was not recorded for this functional
cohort. CLI wall times were 8.9 s for the first WebGPU pack, 16.0 s for the remaining
four, and 27.0 s for all five WebGL packs. These are shader/pixel correctness
checks, not 16 ms interaction or whole-template performance measurements.

Primary references: [Three.js TSL](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language)
and [Three.js SampleNode](https://threejs.org/docs/pages/SampleNode.html).
