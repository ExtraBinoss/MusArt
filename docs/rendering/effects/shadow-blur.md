# Soft blur and drop shadow

Blur uses two bounded 17-tap Gaussian passes. `amount × scale` is its authored standard deviation in pixels. Samples interpolate premultiplied RGBA explicitly before accumulation; this keeps transparent edges soft and avoids dark fringes and different horizontal/vertical radii caused by mixed sampler policies. The finite kernel reaches 3.2 standard deviations. It is a bounded approximation, not an unbounded convolution.

The algorithm follows the separable Gaussian and premultiplied-alpha principles documented by [Three.js GaussianBlurNode](https://threejs.org/docs/pages/GaussianBlurNode.html). Melt retains its own existing shared TSL pass owner, queue, cache admission and export path; it does not introduce an independent postprocessing renderer.

Drop shadow applies the same kernel to the source silhouette, with signed horizontal/vertical document-pixel offsets, editable color and opacity. It composites behind the unmodified source. A shadow can darken underlying layers through ordinary source-over composition. Zero amount keeps the source; disabling the effect skips its passes. The effect is available through the shared effect library, supports validated commands, animation channels, portable serialization and undo/redo.

## Transport and resource ownership

Blur and shadow declare expanding coverage. Their effect-owned footprints reserve transparent margins before GPU processing. Blur reserves its complete scale range through amount animation, so a continuous entrance does not resize targets every frame. Logical source placement carries the expanded rectangle through ordinary blending, transformed groups, reference mips and export; canonical layer bounds and layout remain unchanged. A mask maps the expanded plane into the original mask coordinate system, including an expanded mask source.

All enabled effects run on the resulting padded source plane. The stack has one conservatively admitted margin rather than allocating a distinct expanded surface for each effect. Spatial treatments later in that stack therefore see that padded plane. Per-layer targets and shared scratch/backdrop textures remain in the existing hard GPU cache, and actual texture-limit failures propagate. Multi-pass treatments preserve their original input before reusing ping-pong targets. Shader warmup binds distinct source/backdrop textures to prevent Three.js sampler deduplication from aliasing them.

## Share Your Work reference

The supplied reference is 37 decoded frames at 30 fps. White-text pixel masks reveal the following bottom-to-top stack: Cards 5/6/7, WORK, Card 4, YOUR, Cards 3/2/1, SHARE, Card 8. At 0 s SHARE is above Card 1 while YOUR is shaded and partly hidden below it; at 0.5 s YOUR is above Card 4 while WORK is partly covered; at 0.833 s Card 8 crosses SHARE and YOUR. The changing grayscale below photo edges supports photo drop shadows rather than a permanent bevel/emboss on the typography.

The template uses eight replacement photographs with corrected positions, rotations and card sizes. Black shadows start at 65% opacity, 10 px downward offset and 12 px blur; these are visual reconstruction settings, not recovered Jitter parameters. Scale settles rapidly; the requested entrance blur remains visible for 225 ms. Card removal keeps the reference's sharp cadence. Card 8 sits higher over SHARE; the repeated first card travels approximately 45 px.

## Verification

Focused engine regressions cover portable settings, invalid imports, atomic rejection, undo/redo and template command replay. Native browser checks decode actual PNG exports on WebGPU and Three.js WebGL fallback, checking softened alpha outside the source, symmetric blur, preserved white color, masking, shadow direction/color, zero strength and raster-density agreement. Production pixel-read APIs are instrumented separately from the PNG inspection page. Generated evidence is retained under ignored `artifacts/shadow-blur/`.
