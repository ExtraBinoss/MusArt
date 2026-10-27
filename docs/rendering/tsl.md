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

A builder test verifies its graph and uniforms, not its pixels. Browser tests export small reference scenes and verify colors, alpha, order, and confinement on WebGPU and the same renderer's WebGL2 backend.
