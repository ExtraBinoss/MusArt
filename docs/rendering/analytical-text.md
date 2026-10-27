# Analytical text in Three/TSL

MusArt's text layers use an analytical curve renderer rather than Canvas2D glyph bitmaps, SDFs or tessellated outlines. The reference is the project owner's [ts-slug](https://github.com/ExtraBinoss/ts-slug), inspected at revision `a8a47a8bb0a35cde92bafaf52934a3c0a21e9674` on October 27, 2026. The local checkout in `third_party/clone/ts-slug` is ignored by Git and is never imported at runtime. MusArt's implementation lives in `packages/render/src/surface/text/`.

The reference credits Eric Lengyel's Slug algorithm and the JSlug/Sluggish ports. MusArt rewrites curve generation, instanced geometry and ray coverage as strict TypeScript and Three.js TSL. Its materials do not inject GLSL, WGSL, ShaderMaterial or native WebGPU pipelines. The source repository currently lists license documentation as a TODO; this reference is recorded explicitly rather than being described as an MIT dependency.

## Preparation and ownership

- Twenty local TrueType families ship with OFL notices and a [pinned source/checksum manifest](../../apps/web/public/fonts/manifest.json), spanning sans, serif, mono, display and handwriting styles. The font loader retains five recent idle faces; active preparation leases protect native font objects from eviction. Legacy Arial, Georgia and monospace family values resolve to Arimo, Tinos and Roboto Mono; unknown system-family values resolve to Inter consistently across devices.
- OpenType.js parses outlines and variable glyph coordinates. HarfBuzz shapes font metadata, including kerning, ligatures, glyph offsets and variation advances. HarfBuzz buffers, fonts, faces and blobs are destroyed explicitly. These CPU operations prepare reusable font data and never read rendered pixels.
- The layout engine wraps tokens and clips the visible text frame. Preparation normalizes decomposed text to NFC without editing the portable document. This is a horizontal editor layout; mixed-script bidirectional paragraph layout and color emoji are not yet supported. The user-wide [font library](../fonts.md) supplies imported, Google and browser-discovered local outlines through the same resolver used for preview and export.
- Quadratic outlines stay exact. Cubic outlines are recursively converted to quadratics with a 0.125-font-unit sampling tolerance and a bounded subdivision depth. Both horizontal and vertical band lists index the curves. Atlases hold curve coordinates and indices, not glyph pixels.
- Glyphs are instanced quads. Cached geometry excludes paint, opacity, position and export scale. The GPU cache accounts for the atlas and instance buffers; eviction disposes their textures, geometry and materials. Hidden ancestor branches are skipped and failed or cancelled preparation cannot republish resources after disposal.

## GPU coverage and paint

Each fragment solves quadratic intersections in its horizontal and vertical bands and averages the two signed coverage estimates. Derivatives provide the actual pixel footprint. Coefficients are formed before fragment translation to avoid float32 cancellation on straight contours, and quadratic roots use the stable q formulation with a scale-relative linear threshold. Shared TSL expressions are assigned before conditional root branches; lazy expressions first evaluated inside one branch must not be reused as though assigned in another. Linear roots use guarded denominators.

Instanced glyphs use premultiplied maximum blending to union overlapping coverage. Negative tracking therefore does not compound a semitransparent fill. All glyph instances sample the same layer-space paint at a given position. Solid RGBA, linear and elliptical radial gradients support two to eight ordered stops, alpha and duplicate-offset hard stops. Linear angles use pixel-space direction with 0° left to right. Paint parameters remain stable uniforms during scrubbing.

The resulting GPU texture enters the existing isolated layer/group pipeline. All layer blend modes, masks, effects and working-space conversion apply normally. There are no production glyph raster calls or GPU pixel reads into JavaScript.

## Preview and export density

The editor requests a quantized zoom × device-density scale after navigation settles. It updates the R3F drawing buffer and the composition render scale together. Original image textures and glyph outlines remain reusable. Resolution is capped by the 16,384-pixel edge limit, 64-megapixel image limit and a conservative retained-target memory estimate. Large compositions may therefore use a lower preview density; export always uses its explicitly requested scale within the renderer's limits.

Native PNG/WebP/JPEG and video exports consume the same GPU graph. Low-scale output keeps extra quad padding for analytical antialiasing. Neither export nor preview uses a Canvas2D text layer.

## Verification

Mirrored tests cover outline conversion, bands, local font loading, shaping, wrapping, live paint uniforms, resource cleanup, visibility and failure paths. `test/browser/text-rendering.spec.ts` independently checks real WebGPU and WebGL fallback pixels: counters, alpha, color, gradients, tracking, weight, kerning, accents, masks, effects, blending and sharp high-density preview/export. `test/browser/text-outlines.spec.ts` also compares diagonal and straight glyph interiors against the original font paths rendered by an independent browser reference. Both suites instrument actual read APIs before boot and inspect delivered images in a separate page.

Primary references: [Three TSL API](https://threejs.org/docs/pages/TSL.html), [InstancedBufferAttribute](https://threejs.org/docs/pages/InstancedBufferAttribute.html), [OpenType.js](https://github.com/opentypejs/opentype.js), [HarfBuzz.js](https://github.com/harfbuzz/harfbuzzjs). Versions are pinned in the workspace manifests and lockfile.
