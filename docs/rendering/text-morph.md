# Native contour morphing

Morph is a source-owned geometry effect. Its portable `shapeMorph` data contains independent shapes, normalized closed contours, explicit holes, placements and ordered timed states. The same effect works on editable text and on authored monochrome vector geometry. Ordinary moves, scale, blur, masks and other effects continue to compose around that source.

Preparation normalizes contour winding, associates holes by spatial continuity, resamples bounded loops and aligns their cyclic origins. Missing holes collapse to points. One floating-point texture stores every contour state, conservative union ray bands, placements and timing. One interleaved instance buffer identifies the shapes. Three TSL interpolates placements and curve coordinates; the existing analytical text coverage evaluates filled pixels. Playback changes uniforms and never triangulates, rasterizes glyphs, rebuilds atlases, or reads GPU pixels into JavaScript.

Preparation rejects over 256 shapes, 120 states per shape, 32 contours per state, 262,144 authored/prepared points, 1,024 curves per ray band or a 64 MiB atlas. Geometry resources and render targets use the existing bounded cache and disposal path. Immutable geometry has a session-local cache identity, keeping large contour arrays out of per-frame source-key serialization. That identity is never persisted.

Editable text without custom targets generates reusable inflated contours from the native shaped glyph outlines. Authored targets can bind to text and font metadata; editing that text or font regenerates glyph geometry while preserving the original text anchor. This is not automatic morphing between arbitrary font families. Exact designed endpoints remain explicit authored contours. The current vector treatment uses one layer fill/gradient, not independent imported multicolor parts or animated strokes.

Animation blocks own their independent effects. Where several geometry-source blocks affect one object, the most recently started enabled block supplies geometry; before any start, the earliest enabled block supplies its initial state. Other geometry sources are disabled only in the evaluated frame. Occurrence scope, authored effect enable keys, disabling, undo, exact seeks and ordinary effect composition remain authoritative. Saving or duplicating a preset captures live effect parameters and contour data.

## Historical Morphing Type reference

The original reference composition, upgraded to 1920 × 1080 at 30 fps for the diagnostic below, reconstructs the supplied `scene.mp4`: a regular cyan MORPH, staggered inflated letter contours, settling and a final stretch across the frame. It contains one editable text object and one animation block. Its 67 authored states per shape are vector contours traced from the user-supplied decoded frames; the clip itself is not a rendering asset. The background and cyan are sampled from the reference. The Jitter watermark is excluded.

The library now ships an original Melt mascot loop under the stable `morphing-type` identifier; the following reference measurements describe the archived supplied-clip reconstruction, not that newer mascot.

The default workflow is Text → Add motion → Typography → Inflate, Inflate & stretch, or Letter stretch. Duration, intensity, stagger and letter order are available without opening keyframes. Details remains optional. The historical Morphing Type reference supplies the specific designed endpoints; another text uses generated contours rather than pretending that the MORPH outlines belong to that text.

Native verification uses one retained render session, arbitrary forward/backward seeks, generated HELLO text and a vector with an appearing hole, on WebGPU and WebGL. Actual GPU/Canvas JavaScript read APIs are instrumented. Reference silhouette overlap and encoded-video measurements are recorded in the local ignored `artifacts/morph-reference/` and browser outputs; they are not a claim of full-frame pixel identity or a general frame-rate benchmark.

Historical verification at the original 790 × 480 resolution: across all 67 decoded reference frames, the native WebGPU cyan silhouette intersection-over-union has a minimum of 99.32% and a mean of 99.72%. The exported 67-frame H.264 clip has a minimum boundary F1 of 99.60% with a 1.5-pixel tolerance; chroma subsampling shifts some small-letter edges, so encoded frames are not pixel-identical. The comparison excludes the reference watermark and evaluates the cyan shapes against the sampled background.

## Compact authoring and cooperative preparation

`compactShapeMorph` is a pure-core authoring utility with an explicit final-layer pixel tolerance. It preserves all timed states, placements and hole records, guards winding and contour crossings, and keeps ambiguous paths unchanged. The Full HD reference retains 67 states per shape with at most 2 pixels of authored-contour deviation (less than one original-reference pixel). Its geometry falls from 77,780 to 40,228 points; the generated manifest falls from 3,178,623 to 1,395,954 bytes. Existing saved projects are not rewritten.

The render adapter consumes the same `prepareMorphShapeSteps` generator in cooperative batches. Text morph atlas alignment and packing give native tasks a turn after a roughly 4 ms work budget, check supersession between batches and retain the synchronous API for noninteractive callers. Both paths produce identical atlas bytes; frame playback continues to update uniforms rather than rebuilding geometry. No worker pool or JavaScript GPU readback is introduced.

In the local native WebGPU witness, six representative key states/seek positions have a minimum silhouette IoU of 98.48% against the original authored paths and boundary F1 of 100% within 2 pixels at a 960 × 540 witness size. These are geometric witness measurements, not full-frame pixel identity or a general playback-rate claim. The renderer and instrumented native read APIs reported zero JavaScript pixel readbacks. Opening and preparation timing details are in [template opening](../performance/template-opening.md).
