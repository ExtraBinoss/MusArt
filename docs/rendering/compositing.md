# Retained GPU document renderer

`@musart/render` uses Three.js `WebGPURenderer` and TSL throughout. Three's WebGL backend runs the same node graphs when WebGPU is unavailable. No GLSL material, JavaScript pixel readback, or CPU intermediate composition is used.

## Ownership and presentation

| Renderer topic                   | Contract                                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Renderer owner                   | The live editor passes its existing R3F renderer to `new GpuCompositor(renderer)`.                                                                                 |
| Render result                    | `render(page, assets, {scale})` returns a retained texture and dimensions; it never creates or disposes that renderer.                                             |
| Graph lifetime                   | Dispose the graph when its document viewport closes.                                                                                                               |
| Submission and state restoration | All GPU passes execute synchronously after asynchronous source preparation, restore the previous render target and `autoClear`, and use a serialized render queue. |

### Readiness and device loss

| Renderer topic              | Contract                                                                                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Readiness boundary          | Presentation readiness is separate from completion of the latest requested revision.                                                                                          |
| Property preview            | Property previews and same-artboard dimension changes retain the last valid display plane and texture while the replacement is prepared.                                      |
| Initial and artboard reveal | Only the first presentation or a different artboard starts the finite loading reveal; pending property work never restarts its overlay.                                       |
| Device loss                 | The adapter relays Three's public device-loss callback, stops further submissions, preserves the native diagnostic and never labels a lost-device no-op as a completed frame. |
| Replacement renderers       | It does not create automatic replacement renderers.                                                                                                                           |
| Callback cleanup            | Disposal restores the callback only while the adapter still owns it.                                                                                                          |

Live diagnostics include Three's actual uniform-buffer count/bytes, program count and renderer-target count alongside the graph's owned resources. These CPU bookkeeping counters do not read GPU pixels.

### Texture and blend conventions

| Renderer topic        | Contract                                                                                                                                                                                                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orientation           | Render-target samples explicitly flip Y at each sampling boundary.                                                                                                                                                                                                                                               |
| Source orientation    | Imported images and glyph canvases retain their source orientation.                                                                                                                                                                                                                                              |
| Intermediate alpha    | Intermediate buffers contain encoded working RGB; some contain premultiplied alpha, declared by `FrameTexture.premultiplied`.                                                                                                                                                                                    |
| Final alpha           | The final texture is premultiplied.                                                                                                                                                                                                                                                                              |
| Presentation material | Presentation uses a `MeshBasicNodeMaterial`, `NoBlending`, and a linear Three output setting to avoid a second sRGB transfer.                                                                                                                                                                                    |
| Normal composition    | Ordinary source-over layers are batched into one draw per isolated group.                                                                                                                                                                                                                                        |
| Other blends          | Other modes use a ping-pong backdrop pass with W3C source-over alpha.                                                                                                                                                                                                                                            |
| Blend catalog         | Supported modes are normal, darken, multiply, color burn, linear burn, lighten, screen, color dodge, linear dodge, overlay, soft light, hard light, vivid light, linear light, pin light, hard mix, difference, exclusion, subtract, divide, hue, saturation, color, luminosity, Darker Color and Lighter Color. |
| Mode updates          | Changing the mode updates a uniform; it does not compile another material.                                                                                                                                                                                                                                       |

### Material lifetime

| Renderer topic                 | Contract                                                                                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Retained source-over materials | Already-created source-over materials remain retained while their layer ID exists in the current page, including descendants of a cached subtree.              |
| Live membership                | The compositor reuses the geometry index's membership lookup; it does not allocate a separate live-ID set on each preview or create materials for undrawn IDs. |
| Deleted and foreign IDs        | Deleted or foreign-page IDs are released even when the complete destination frame is cached.                                                                   |
| Cached ancestors               | A cached ancestor must not cause temporary material disposal and uniform-buffer churn during an unrelated property gesture.                                    |

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

### Primitive capacity and counters

| Renderer topic              | Contract                                                                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instance capacity           | One power-of-two instance buffer grows to at most 16,384 instances; larger runs are split into consecutive draws.                                           |
| Budget admission            | Geometry, instance matrices and attributes are charged to the hard GPU cache before growth.                                                                 |
| Disposal                    | Retiring a buffer disposes its InstancedMesh and geometry; the shared material is disposed with the operator.                                               |
| 10,000-primitive allocation | A 10,000-primitive run owns less than 2 MiB of GPU vertex/instance data and uses one primitive draw plus the normal document clear/presentation operations. |
| Counters                    | `primitiveDraws`, `primitiveInstances` and `primitiveBytes` expose the actual operator submissions, cumulative submitted instances and current allocation.  |

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

| Renderer topic          | Contract                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Images                  | Original decoded image textures are uploaded once per original.                                                                                                |
| Text                    | Text is shaped with HarfBuzz and rendered from cached analytical glyph curves; paint changes update GPU controls.                                              |
| SVG geometry and paints | SVG paths are parsed with Three's `SVGLoader` and triangulated once per geometry identity; subsequent fill and branded part paint changes update GPU uniforms. |
| SVG semantics           | SVG viewBox origins, part transforms, even-odd holes and stroke geometry are retained.                                                                         |

### Effect catalog and density

| Renderer topic                  | Contract                                                                                                                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Existing treatments             | The effect registry contains dither, ASCII, brightness, contrast, grayscale, blur, exposure, saturation, hue, vibrance, temperature, tint, gamma, invert, sepia, threshold, posterize, grain, halftone, vignette and Gradient. |
| Procedural treatments           | It also includes Live Ripple, Shatter, 3D Noise, Flash Light, Circle, Cyanotype, Datamosh block smear, CRT, One-bit Dither, Receipt and Pink Phosphor.                                                                         |
| Default alpha                   | Default image treatments preserve original per-pixel alpha.                                                                                                                                                                    |
| Explicit coverage changes       | Explicit rounded coverage, ink/paper opacity and transparent cuts can remove coverage; the amount and spatial-envelope transitions for cuts interpolate premultiplied color to avoid dark fringes.                             |
| Deterministic grain             | Grain uses an integer hash and the document seed, with no clock dependency.                                                                                                                                                    |
| Authored units                  | Effect parameters remain in authored layer/document units at every preview or export density.                                                                                                                                  |
| Logical and physical dimensions | The compositor supplies logical layer dimensions separately from physical target dimensions; pixel motifs, blur offsets and noise use logical coordinates, while sampling clamps and antialias footprints use actual texels.   |
| Zoom invariance                 | Zoom changes raster density without changing the field, its seed, motif size or phase.                                                                                                                                         |
| Groups and masks                | This also applies to isolated groups and referenced mask sources.                                                                                                                                                              |

### Mask graph

| Renderer topic         | Contract                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Mask kinds             | Masks accept an original asset or another layer/group, with alpha or luminance coverage and optional inversion.      |
| Coordinate mapping     | Layer references map target coordinates through the target's world transform and the inverse source world transform. |
| Coverage contributions | Source visibility and ancestor opacity contribute to coverage.                                                       |
| Mask-source visibility | A `maskSource` layer remains available to references and is omitted from the ordinary visible stack.                 |
| Dependency validation  | Core validation rejects dependency cycles.                                                                           |

### GPU cache and device limits

| Renderer topic      | Contract                                                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accounted resources | The shared cache accounts for original texture bytes, target storage, SVG geometry, effect scratch storage and the ASCII atlas.                                                                               |
| Hard budget         | Its default hard budget is 384 MiB.                                                                                                                                                                           |
| Texture side limits | Decoded originals and isolated effect/layer targets also check the acquired device/context maximum texture side length before upload, allocation or resize; this may be lower than the page/export API limit. |
| Capability cache    | Capability metadata is cached by device/context identity.                                                                                                                                                     |
| Explicit failure    | Unsupported work rejects explicitly while the completed presentation remains intact; directly batched large primitives do not allocate a large texture and remain valid.                                      |
| Growth guard        | Target growth is checked before allocation, protecting the last valid presentation when a new frame exceeds the budget.                                                                                       |
| Stats               | `stats()` exposes passes, readbacks (always zero), uploads, targets, cache bytes, frames, cache hits, vector parses and the configured budget.                                                                |

### Fixed reference and mip transport

| Renderer topic            | Contract                                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Dimensions                | `GpuEffects.apply` accepts authored dimensions separately from physical target dimensions.                                                     |
| Reference density         | The compositor evaluates every enabled effect stack and mask at one fixed authored 1× reference density, including isolated group descendants. |
| Identical originals       | Images and asset masks are uploaded from identical decoded originals in every context; no thumbnail-only source resize is allowed.             |
| GPU reference plane       | The completed stack and mask are copied into a premultiplied GPU reference plane with a full mip pyramid.                                      |
| Cache identity            | The cache key for this plane is independent of the requested output density.                                                                   |
| Reconstruction            | Trilinear minification samples the pyramid; nearest magnification preserves the reference raster's pixels.                                     |
| Unprocessed layers        | Pure layers without effects or masks retain their existing vector/native-image rendering.                                                      |
| Mip accounting            | All mip levels count toward the same hard GPU LRU budget.                                                                                      |
| Boundary scope            | This reference belongs to an effect/mask boundary, not a forced 1× flattening of every plain vector page.                                      |
| Final composition         | Final inter-layer composition still uses the requested output density.                                                                         |
| Cross-density differences | Antialiasing, correlated alpha and backdrop-dependent blending therefore need not equal a byte-for-byte reduction of the complete 1× page.     |
| Processed groups          | Blending inside an isolated group carrying effects is included in that group's fixed reference before filtering.                               |
| Native checks             | Native tests distinguish identical effect content and matched-footprint presentation from these normal cross-density compositing differences.  |

### Presentation footprint

| Renderer topic       | Contract                                                                                                                                                                                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Minification         | Below 1× physical density, the editor passes the requested minification into the renderer so the shared reference plane is filtered for the real presentation footprint.                                                                                       |
| Density rounding     | Floating-point gesture noise is rounded to six decimals below 1×; above 1×, quarter-density steps keep useful intermediate quality without promoting boundary noise into a higher tier.                                                                        |
| Smallest axis        | The smallest drawing-buffer axis stays at least one pixel.                                                                                                                                                                                                     |
| DPR changes          | A rearmed resolution media query and resize observers update density without requiring another canvas zoom. One 140 ms timer is cancelled on replacement/unmount; there is no React frame subscription.                                                        |
| Target estimate      | Actual instanced primitives, clipped groups, source targets and shared scratch replace per-layer rectangle guesses. Effect/mask reference subtrees retain fixed 1× cost. The soft target estimate remains 192 MiB with reserved headroom.                      |
| Original resources   | Image originals are deduplicated by asset; independently timed video layers reserve their own source and three upload slots. These costs are separate from the target soft budget and participate in the estimated 384 MiB total.                              |
| Admission limit      | The 384 MiB native cache still admits all actual retained, pooled and in-flight resources. The quality estimate is not a guarantee of total GPU occupation; infeasible fixed content reports a real renderer failure rather than becoming a one-pixel success. |
| Device bounds        | Both minified and enlarged requests obey API/pixel bounds and the acquired device's texture limit. Every raster axis stays at least one physical texel.                                                                                                        |
| Exact backing size   | The adapter retains the exact integer dimensions of the completed `FrameTexture`.                                                                                                                                                                              |
| Fiber backing repair | Before R3F's automatic render, a priority −1 frame callback repairs a floor-rounded backing with Three's public `setDrawingBufferSize(width, height, 1)` only when its dimensions differ.                                                                      |
| CSS geometry         | CSS size, viewport coordinates and the authored orthographic camera remain unchanged.                                                                                                                                                                          |
| Per-axis correctness | This works independently on both axes and is reapplied after Fiber resize; presentation never adds an avoidable one-pixel downsample before CSS reconstruction.                                                                                                |

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

| Renderer topic     | Contract                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frame mutex        | The consumer callback is inside the session queue: the next frame cannot overwrite its native GPU canvas until the callback settles.                   |
| Video frame        | A video encoder can create a browser `VideoFrame` directly from this canvas.                                                                           |
| Borrowed canvas    | `session.render()` also returns that borrowed canvas, valid until the next render.                                                                     |
| Retained resources | Sessions retain their renderer, geometry, textures, shaders and effect resources across frames; disposal is idempotent and waits for the active queue. |

## Regression evidence

`primitives.spec.ts` checks mixed ordered runs, rotated/stroked alpha shapes, isolated groups, both backends and a real 10,000-instance frame with bounded target/buffer counts and zero production readbacks.

`render-lifecycle.spec.ts` records every animation frame during AFTERHOURS color previews, extreme position/rotation edits and same-artboard resizing. It checks loading/canvas visibility, retained context/resource counts, continuous-preview React commits, console diagnostics and actual readback hooks; screenshots and its environment report remain in ignored artifacts.

### Backend regression coverage

| Renderer topic         | Contract                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Composition scenarios  | `test/browser/rendering.spec.ts` checks nested target orientation, source-over alpha, the original 24 blend modes against independent W3C/Canvas2D references, vector holes and recoloring, and transformed group masks. |
| Complete blend catalog | `gradient-effects.spec.ts` additionally checks darker/lighter color using whole-RGB sums and ties, completing the 26-mode catalog.                                                                                       |
| Adjustments and color  | `rendering-adjustments.spec.ts` checks all new corrections, per-pixel alpha, deterministic grain, Display-P3 asset round trips and opaque print proof.                                                                   |
| Backends               | Each scenario runs both WebGPU and Three's WebGL fallback.                                                                                                                                                               |
| Pixel inspection       | Test-only PNG decoding uses Canvas2D; production rendering does not.                                                                                                                                                     |

### Density and screen comparisons

| Renderer topic         | Contract                                                                                                                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixtures and zoom      | `effect-density.spec.ts` adds all-catalogue 1×/2×/4× native PNG comparisons on both backends and real Ctrl+wheel 100%/200%/400% editor checks.                                                                       |
| Canvas/export identity | The browser-native PNG encoding of the actual editor GPU canvas must match the same-density export in every decoded RGBA byte.                                                                                       |
| Readiness identity     | Readiness checks the durable project ID as well as page, revision and density.                                                                                                                                       |
| Screen clips           | Native wheel pan aligns the canvas for exact-size screen clips; their measured differences remain separate CSS/browser presentation diagnostics.                                                                     |
| Screen-only difference | A two-document-pixel folds fixture demonstrates why: its GPU canvas and export are byte-identical, while the browser's screen reconstruction attenuates the alternating columns (mean RGB difference 9.209 at 100%). |
| Rejected explanation   | Removing animation fill did not change this screen-only difference.                                                                                                                                                  |

Fixtures cover every Gradient field and treatment, isolated constant-color frost noise, minimum treatment size, fractional dimensions, and overlapping translucent multiply layers inside processed masked groups. Decoding and pixel measurements occur only in an uninstrumented inspection page. No-op fixtures fail separately. Generated reports live under ignored `artifacts/effect-density-*.json`; these are functional image comparisons rather than display-latency measurements.

### Fractional Grain error terms

| Renderer topic                | Contract                                                                                                                                                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sample set                    | The fractional Grain comparison retains every pixel in the same 96×64 crop (6,144 samples).                                                                                                                                 |
| Error terms                   | With normalized alpha a,b and straight RGB bytes C,D, it computes the common-coverage color term K=min(a,b)\|C−D\| and the coverage term G=\|a−b\|×(C if a≥b, otherwise D) directly per channel.                            |
| Triangle bound                | Signed premultiplied differences decompose exactly; absolute raw error obeys the triangle bound raw≤K+G rather than universal equality.                                                                                     |
| Color and raw bounds          | The original color bound remains four byte levels on K, with an explicit raw bound of four plus measured G.                                                                                                                 |
| Observed values               | The raw WebGL 2× observation remains 4.435; K was 2.535 and G was 1.901.                                                                                                                                                    |
| No excluded samples           | No border, pixel, or alpha class is excluded, and no average is subtracted to manufacture K or G.                                                                                                                           |
| Amount-zero control           | An enabled amount-zero Grain control preserves the identical reference/mip geometry path.                                                                                                                                   |
| Coverage-map equivalence      | Its reference alpha map, candidate alpha map and signed cross-density coverage-difference map must match the processed fixture pixel by pixel.                                                                              |
| Disabled-effect control       | The effect-disabled control still retains its original 0.01 mean-alpha difference gate; its per-pixel maps are reported separately because disabling the effect may change the geometry rasterization path.                 |
| Full-image equality           | `reference-sampling.spec.ts` additionally requires exact full-image RGBA equality between the real transparent fractional editor canvas and same-density exports on both backends.                                          |
| WebGL snapshot                | The WebGL test snapshots natively in the draw task before presentation clears the default framebuffer; production preserveDrawingBuffer is unchanged.                                                                       |
| Dither fixture                | `reference-sampling.spec.ts` also checks an invariant high-contrast gray-source Dither at authored widths 95.999 and 96, both with a 96-texel reference, exported at 2×.                                                    |
| Rejected magnification policy | This protects against a rejected fractional-only linear-magnification policy: it reduced the fractional Grain proxy error but caused a real resize flash (opaque ROI RGB mean difference 96, contrast 96–159 versus 0–255). |
| Production kernel             | Production keeps the common nearest magnification policy; geometry edits do not select another reconstruction kernel.                                                                                                       |

### Dither preview witness

| Renderer topic                 | Contract                                                                                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Workload                       | `dither-preview.spec.ts` covers the actual two-effect Dither→Halftone stack at pattern scales one and two, an original source larger than the removed 640px preview limit, 778×778 authored bounds, DPR 1.25, and real 31%/49%/50%/51%/100%/200% wheel zoom. |
| Visible surface comparison     | It compares native screenshots of the displayed main and popover surfaces at the same physical footprint after popup animations finish, using a fixed opaque crop without pixel-alignment search.                                                            |
| Pixel phase                    | Native wheel pan aligns geometric pixel phase.                                                                                                                                                                                                               |
| Canonical and browser evidence | PNG 1×/2× checks retain the canonical raster; browser/WebP differences are measured rather than claimed byte-identical.                                                                                                                                      |
| Reproduction image             | The reproducible default uses a repository photograph; `MUSART_REFERENCE_IMAGE` can supply an ignored private reproduction asset such as the actual BeamIcon original.                                                                                       |
| Reports                        | Reports and captures live under ignored `artifacts/reference-surfaces/`.                                                                                                                                                                                     |

The eleven new procedural effects share the definition/settings/uniform contract documented in [effect authoring](effects/authoring.md). Per-effect visual references and decoded native results live in their own rendering documents. [Groups, masks and Display-P3 verification](effects/groups-p3-verification.md) covers every new type under nested transformed groups and a real layer mask on both backends. [Texture dimension verification](texture-limits.md) records actual device limits, rejected allocations, valid recovery and preserved prior pixels.
