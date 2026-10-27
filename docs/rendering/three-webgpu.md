# Three.js WebGPURenderer — local project reference

Verified for `three@0.186.1` on October 27, 2026. These are working notes, not copied documentation. Primary sources: [official WebGPURenderer guide](https://threejs.org/manual/pages/webgpurenderer), [WebGPURenderer API](https://threejs.org/docs/pages/WebGPURenderer.html), [Renderer API](https://threejs.org/docs/pages/Renderer.html), and [RenderTarget](https://threejs.org/docs/pages/RenderTarget.html).

## Imports and initialization

- Import `WebGPURenderer`, node materials, and resources from `three/webgpu`; shading functions come from `three/tsl`.
- `await renderer.init()` precedes the first manual render. Initialize asynchronously inside R3F's `gl` factory.
- The renderer selects WebGPU and provides a WebGL2 backend. `forceWebGL: true` supports fallback tests. If WebGPU exists but adapter initialization fails, dispose the failed instance and initialize a new instance forced to WebGL.
- In r186, `renderer.dispose()` returns a promise: await it, including error paths.
- Passes use `MeshBasicNodeMaterial` and TSL nodes. No GLSL ShaderMaterial, RawShaderMaterial, onBeforeCompile, or EffectComposer pipeline.

## Resources and passes

- A `RenderTarget` is a GPU rendering destination whose `.texture` can be sampled directly by the next pass.
- Set `depthBuffer: false` and `stencilBuffer: false` on 2D surfaces that do not need depth.
- A pass must not sample its own destination texture. Alternate two targets (ping-pong), then pass the final texture to composition.
- Save and restore render target, viewport, scissor, and autoClear when sharing the renderer with R3F.
- Returned targets belong to the composition graph and remain alive until replacement/eviction. The renderer belongs to its adapter; the graph does not destroy it.
- Value changes update existing uniforms. Size changes may resize a target. Renaming or moving a layer must not reupload its source.
- Bound caches explicitly; release textures, targets, materials, and geometry on eviction or unmount.

## No GPU reads into JavaScript

`readRenderTargetPixels*`, `readPixels`, JavaScript-mapped buffers, and GPU → ImageData copies are not part of the interactive pipeline. The image remains a texture from its first effect pass through presentation.

Imports decode images, and text/vector sources are prepared when their content changes. This CPU preparation does not read a GPU texture. Color selection uses the original asset's pixels in a worker; segmentation executes its model on WebGPU when available.

For exported files, render the final texture onto a GPU canvas and let the browser encode it with `toBlob`. File encoding does not promise zero internal browser CPU work; application code need not read pixels into a JavaScript array.

[MDN canvas.toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob). For detached snapshots, [OffscreenCanvas.transferToImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas/transferToImageBitmap) and `bitmaprenderer.transferFromImageBitmap` avoid a Canvas2D intermediary.

## Lessons from verification

- Validated headless Chromium runs on Linux used `--use-angle=vulkan --enable-features=Vulkan` alongside `--enable-unsafe-webgpu --enable-unsafe-swiftshader`. Without these options, Dawn could report an initialized backend while presenting no pixels. The current load-test report records an Intel `xe-lpg` adapter; launch flags do not prove software rendering. Earlier segmentation verification did not record adapter hardware classification.
- CSS dimensions after zoom are distinct from document dimensions. Use document dimensions for the orthographic camera and presentation geometry; do not apply zoom twice.
- R3F configures output color space after the asynchronous renderer factory returns. A raw sRGB composition texture needs both the renderer's intended color-space setting and the matching Canvas `linear` setting; otherwise an additional encoding pass washes out colors.
- r186 GPU reads can include row padding. An earlier implementation encountered this; the final pipeline avoids these reads.
- An FPS metric without hardware, backend, resolution, and workload is insufficient. Load reports distinguish first opening, warm cache, interactions, and export.
