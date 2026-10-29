# Shatter

Shatter refracts the source image through deterministic procedural glass facets. It is a two-dimensional image effect, not a structural fracture simulation or a scene containing extruded glass meshes. The implementation is original MusArt TSL; no shader strings, external texture, runtime physics, GPU pixel readback or clock-based randomness are involved.

## Visual and algorithm references

- [SWGMAT, Glass Fractures, published by NIST (2004)](https://www.nist.gov/document/glassfracturespdf) distinguishes outward radial cracks and concentric cracks formed as straight segments ending on existing radial cracks. This motivates the impact pattern's irregular radial sectors and independently offset circumferential chords.
- [Chen et al., Quantity Effect of Radial Cracks on the Cracking Propagation Behavior and the Crack Morphology (2014), Figure 2](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0098196) provides actual high-speed photographs of radial and circular impact cracks. The photographs are a visual reference; they are not bundled or used as texture data.
- [Chan and McCool, Worley Cellular Textures in Sh, SIGGRAPH (2004)](https://history.siggraph.org/wp-content/uploads/2023/01/2004-Poster-018-Chan_Worley-Cellular-Textures-in-Sh.pdf) describes bounded GPU searches of a jittered feature grid and cellular glass shading. MusArt uses a fixed 3×3 winner search with feature offsets restricted to the central 60% of each cell, followed by a 5×5 nearest-bisector search for consistent crack widths.
- [Pharr, Jakob and Humphreys, Physically Based Rendering, Specular Reflection and Transmission](https://www.pbr-book.org/4ed/Reflection_Models/Specular_Reflection_and_Transmission) explains Snell refraction, dielectric indices and wavelength-dependent dispersion. MusArt uses Three's TSL `refract` on a normal per facet, with separate red/blue refractive indices and an explicit image-space thickness. This approximates refraction through an image plane; it does not claim full optical path tracing.

## Controls and rendering contract

The default impact has no protected center: cracks begin at the specified impact position. The optional protected-center radius leaves an intact inner region. Both radii are fractions of the authored layer's smaller dimension, matching the generic `relative-min` radial gizmo. The outer edge fades smoothly; falloff adjusts that fade without changing the fracture seed. A protected center larger than the outer radius is safely clamped inside it during rendering.

Facet size, crack width, thickness and shift use authored document pixels. Cell identities, facet normals, rotations and ring offsets depend only on the document seed. Geometry searches use constant bounded loops, and every continuous parameter is a stable GPU uniform. Changes do not rebuild the graph. The shared compositor evaluates the full effect stack at its canonical reference density and filters the completed result for canvas, thumbnails and export.

The shader samples the actual source image for each facet, including chromatic refraction and a five-tap premultiplied roughness filter. Tint, reflections and dark crack lines affect RGB while retaining the original per-pixel source alpha by default. Original transparent pixels remain transparent even if refraction points at opaque image content. Near transparent refracted samples, the original source color provides a bounded fallback rather than creating an opaque black fringe.

**Transparent cracks** is an explicit coverage change. When enabled, the current crack width cuts alpha inside the affected region, weighted by effect amount. It can remove coverage but cannot increase the original alpha. Disabling it restores alpha preservation. Amount zero is the original image, including alpha, in either mode.

The radial envelope and effect amount interpolate premultiplied colors whenever coverage changes. At half amount, a fully removed crack over solid red keeps red at half alpha rather than creating a dark translucent fringe. Native checks inspect every fully removed pixel for that color/coverage relation.

No input image dimensions are changed for this effect. All sampling remains on GPU textures, and ownership of source textures, passes and filtered reference targets belongs to the existing bounded renderer caches.

## Native verification

`test/browser/shatter.spec.ts` passed on Chromium's WebGPU and Three WebGL backends (10.9 seconds total for both cases). A real 480×320 photograph with transparent rounded corners supplies image structure, text and an alignment border. The default impact changed 103,537 pixels with a premultiplied RGB mean difference of 11.77; changing the seed produced a difference of 11.25. Repeating the original seed and reducing the 2× export both gave exactly zero difference. Default alpha error was zero. Refraction with cracks, tint and highlights disabled still changed the image (mean 37.29); an index of 1 restored the original.

An explicit localized transparent crack test removed coverage only inside the specified Y-down impact radius: measured bounds `[83, 43, 156, 116]` within the expected `[81, 41, 159, 119]`. Extreme settings remained finite and retained source coverage. The real effect switch committed one revision and native undo restored it. Instrumented production GPU, WebGL and canvas pixel-read APIs all recorded zero calls. PNGs, metrics and the frozen native log are kept under ignored `artifacts/shatter/`.

The solid-red cutout witness found 22,950 fully transparent crack pixels on each backend. At half effect amount their red color error was zero, with the expected half-alpha rounded by 0.5 byte. Fully transparent means decoded alpha exactly zero; alpha-one pixels still contain coverage. The default impact's decoded RGBA remained byte-identical to the earlier alpha-preserving render after this interpolation fix.

The native checks also caught a Three TSL temporary-placement issue: an expression shared by two conditional fracture functions was assigned only in one generated branch. Shared authored coordinates and facet scale are now explicitly materialized in the outer TSL function before either branch, ensuring both patterns use the same initialized inputs. Neither image thresholds nor alpha bounds were relaxed.
