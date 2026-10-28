# TSL — implementation notes

Local reference for Three r186, consulted on October 27, 2026: [official TSL guide](https://threejs.org/tsl/) and [TSL API](https://threejs.org/docs/pages/TSL.html).

- Nodes are GPU shader expressions. `texture`, `uv`, `vec2/3/4`, `mix`, `clamp`, `dot`, `floor`, `fract`, and `uniform` compose rendering functions without GLSL/WGSL strings.
- `uniform(number)` retains a stable object; changing `.value` does not require rebuilding its material. A `TextureNode` source can also be replaced through `.value`.
- Values that change during slider gestures belong in uniforms. Keep structural differences, such as effect type, in cached material definitions.
- Use `Node<'vec2'>` / `Node<'vec4'>` for generic expressions: `ReturnType<typeof uv>` can be more specific (`AttributeNode`) than a computed expression.
- Preserve original alpha in dither and ASCII. Sampling a cell must never make transparent source pixels visible.
- Effects are separate modules, each in its own directory. The registry maps an identifier to a builder; it does not contain a large switch implementing effect logic.
- The core catalog describes parameters, bounds, and defaults and never imports Three classes. The inspector builds controls from this contract.
- A group is an isolated graph branch. Its children compose into a local target before its own effects and masks apply to that texture.
- `controls.logicalResolution` is the authored layer size. Spatial effects and noise derive their local document coordinates from it, never from physical render-target dimensions or screen coordinates. `controls.resolution` remains the physical texture size for half-texel sampling bounds; `pixelFootprint` gives one physical texel's size in document units for antialias coverage. Resizing a target must not mutate portable effect sizes or reseed a pattern.
- Every enabled effect stack and its mask run on an authored 1× reference plane. Group descendants share that reference density. Effect builders do not implement zoom-specific resampling, change their seed, or resize source images. The compositor converts the completed plane to premultiplied alpha and builds a GPU mip pyramid; all views and exports sample that same result.
- ASCII's immutable glyph atlas uses four coverage samples and linear filtering within its own glyph cell. This is reference-raster glyph antialiasing, not a zoom-dependent effect implementation. Grain and Bayer remain simple deterministic point fields in document coordinates; generic post-stack mip filtering handles their reduction.

A builder test verifies its graph and uniforms, not its pixels. Browser tests export small reference scenes and verify colors, alpha, order, and confinement on WebGPU and the same renderer's WebGL2 backend.
