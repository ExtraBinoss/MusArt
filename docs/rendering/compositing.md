# Retained GPU document renderer

`@musart/render` uses Three.js `WebGPURenderer` and TSL throughout. Three's WebGL backend runs the same node graphs when WebGPU is unavailable. No GLSL material, JavaScript pixel readback, or CPU intermediate composition is used.

## Ownership and presentation

The live editor passes its existing R3F renderer to `new GpuCompositor(renderer)`. `render(page, assets, {scale})` returns a retained texture and dimensions; it never creates or disposes that renderer. Dispose the graph when its document viewport closes. All GPU passes execute synchronously after asynchronous source preparation, restore the previous render target and `autoClear`, and use a serialized render queue.

Presentation readiness is separate from completion of the latest requested revision. Property previews and same-artboard dimension changes retain the last valid display plane and texture while the replacement is prepared. Only the first presentation or a different artboard starts the finite loading reveal; pending property work never restarts its overlay. The adapter relays Three's public device-loss callback, stops further submissions, preserves the native diagnostic and never labels a lost-device no-op as a completed frame. It does not create automatic replacement renderers. Disposal restores the callback only while the adapter still owns it.

Live diagnostics include Three's actual uniform-buffer count/bytes, program count and renderer-target count alongside the graph's owned resources. These CPU bookkeeping counters do not read GPU pixels.

Render-target samples explicitly flip Y at each sampling boundary. Imported images and glyph canvases retain their source orientation. Intermediate buffers contain encoded working RGB; some contain premultiplied alpha, declared by `FrameTexture.premultiplied`. The final texture is premultiplied. Presentation uses a `MeshBasicNodeMaterial`, `NoBlending`, and a linear Three output setting to avoid a second sRGB transfer.

Ordinary source-over layers are batched into one draw per isolated group. Other modes use a ping-pong backdrop pass with W3C source-over alpha. Supported modes are normal, darken, multiply, color burn, linear burn, lighten, screen, color dodge, linear dodge, overlay, soft light, hard light, vivid light, linear light, pin light, hard mix, difference, exclusion, subtract, divide, hue, saturation, color, luminosity, Darker Color and Lighter Color. Changing the mode updates a uniform; it does not compile another material.

## Instanced primitive runs

Contiguous normal-blend rectangles and ellipses share one retained Three.js
`InstancedMesh` and one TSL material. Instance attributes carry their fill,
stroke, pixel size, corner radius, shape kind and opacity; instance matrices
retain each layer's center, rotation and dimensions. The fragment graph reuses
the same signed-distance shape implementation as isolated surfaces. Hardware
source-over blending preserves instance order within each draw.

Images, text, groups, masks, nonnormal blends, gradient paints and enabled
effects split a run and retain the isolated composition path. Group children
batch only inside that group's own target, preserving group opacity/effects.
Referenced mask layers still obtain their own surface when needed by a mask.
No primitive receives a separate source RenderTarget or material merely to
participate in an ordinary run.

One power-of-two instance buffer grows to at most 16,384 instances; larger runs
are split into consecutive draws. Geometry, instance matrices and attributes
are charged to the hard GPU cache before growth. Retiring a buffer disposes its
InstancedMesh and geometry; the shared material is disposed with the operator.
A 10,000-primitive run owns less than 2 MiB of GPU vertex/instance data and uses
one primitive draw plus the normal document clear/presentation operations.
`primitiveDraws`, `primitiveInstances` and `primitiveBytes` expose the actual
operator submissions, cumulative submitted instances and current allocation.

The operator also retains an LRU of decoded, frozen fill/stroke vectors, bounded
to 128 colors and 16 KiB of key/component payload. Moving repeated-color shapes
reuses these CPU values without parsing or allocating a vector for every
instance. New color strings are validated before insertion; disposal clears
the cache. The payload counter excludes JavaScript object/container overhead.

A render job shares one indexed layer hierarchy and one memoized source-key
resolver. Original identity strings are byte/count bounded; weak, bounded representatives keep live oversized originals stable across equivalent asset-object clones without strongly retaining their bytes.

Source signatures are opaque dependency tokens, avoiding per-layer
full-array scans and recursively escaped group JSON. Primitive signatures
include only paint; names, lock state and editor guides do not invalidate it.

Direct analytical edge coverage can be sharper than the old intermediate
raster texture after rotation or fractional placement. Native tests compare
interior RGBA values, bounded edge error, source ordering and isolated groups
against the exact surface path on both Three backends; decoded exports remain
the pixel witness.

## Sources, effects and masks

Original decoded image textures are uploaded once per original. Text is shaped with HarfBuzz and rendered from cached analytical glyph curves; paint changes update GPU controls. SVG paths are parsed with Three's `SVGLoader` and triangulated once per geometry identity; subsequent fill and branded part paint changes update GPU uniforms. SVG viewBox origins, part transforms, even-odd holes and stroke geometry are retained.

The effect registry contains dither, ASCII, brightness, contrast, grayscale, blur, exposure, saturation, hue, vibrance, temperature, tint, gamma, invert, sepia, threshold, posterize, grain, halftone, and vignette. All effect passes preserve the original per-pixel alpha. Grain uses an integer hash and the document seed, with no clock dependency. Only pixel-sized effect parameters scale with export resolution; color controls and vignette softness retain their units.

Masks accept an original asset or another layer/group, with alpha or luminance coverage and optional inversion. Layer references map target coordinates through the target's world transform and the inverse source world transform. Source visibility and ancestor opacity contribute to coverage. A `maskSource` layer remains available to references and is omitted from the ordinary visible stack. Core validation rejects dependency cycles.

The shared cache accounts for original texture bytes, target storage, SVG geometry, effect scratch storage and the ASCII atlas. Its default hard budget is 384 MiB. Target growth is checked before allocation, protecting the last valid presentation when a new frame exceeds the budget. `stats()` exposes passes, readbacks (always zero), uploads, targets, cache bytes, frames, cache hits, vector parses and the configured budget.

## Color and output

Document working spaces are sRGB, Display-P3, and a generic CMYK print proof. Imported sRGB photos and branded SVG paints are converted into a Display-P3 working document; the current display/export path converts the document back to sRGB. This path does not claim native wide-gamut canvas output.

The generic CMYK proof models under-color removal, a 280% total ink limit, 8% dot gain, a warm paper color and a black floor. It is not an ICC press profile, a calibrated printer simulation, or a CMYK raster encoder. `RENDER_CAPABILITIES` states these limits explicitly. PNG, JPEG and WebP outputs remain RGB.

## Still and video export

`renderComposition` produces a durable GPU snapshot using `createImageBitmap` and `bitmaprenderer.transferFromImageBitmap`. `exportComposition` uses the browser's native PNG/JPEG/WebP encoder. Neither obtains a pixel array in JavaScript.

For repeated frames, use one retained session:

```ts
const session = createRenderSession({ maxBytes: 384 * 1024 * 1024 });
try {
  await session.withCanvasFrame(
    page,
    assets,
    async (canvas) => {
      await encoder.consume(canvas);
    },
    { scale: 2 },
  );
} finally {
  await session.dispose();
}
```

The consumer callback is inside the session queue: the next frame cannot overwrite its native GPU canvas until the callback settles. A video encoder can create a browser `VideoFrame` directly from this canvas. `session.render()` also returns that borrowed canvas, valid until the next render. Sessions retain their renderer, geometry, textures, shaders and effect resources across frames; disposal is idempotent and waits for the active queue.

## Regression evidence

`primitives.spec.ts` checks mixed ordered runs, rotated/stroked alpha shapes, isolated groups, both backends and a real 10,000-instance frame with bounded target/buffer counts and zero production readbacks.

`render-lifecycle.spec.ts` records every animation frame during AFTERHOURS color previews, extreme position/rotation edits and same-artboard resizing. It checks loading/canvas visibility, retained context/resource counts, continuous-preview React commits, console diagnostics and actual readback hooks; screenshots and its environment report remain in ignored artifacts.

`test/browser/rendering.spec.ts` checks nested target orientation, source-over alpha, the original 24 blend modes against independent W3C/Canvas2D references, vector holes and recoloring, and transformed group masks. `gradient-effects.spec.ts` additionally checks darker/lighter color using whole-RGB sums and ties, completing the 26-mode catalog. `rendering-adjustments.spec.ts` checks all new corrections, per-pixel alpha, deterministic grain, Display-P3 asset round trips and opaque print proof. Each scenario runs both WebGPU and Three's WebGL fallback. Test-only PNG decoding uses Canvas2D; production rendering does not.
