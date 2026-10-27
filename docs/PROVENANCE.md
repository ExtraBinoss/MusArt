# Sources, licenses, and technical decisions

- Components in `apps/web/src/components/ui`: the official **shadcn/ui** registry, `new-york-v4` style, Radix family. Each source preserves its registry URL. Adaptations cover aliases, accessible labels, and styles. The MIT license is copied to `legal/shadcn-MIT.txt`.
- Color picker: **react-colorful 5.8.1**, MIT, wrapped by ColorControl with Jotai previews and explicit commits. [Project](https://github.com/omgovich/react-colorful).
- Rendering: **Three.js 0.186.1** and **React Three Fiber 9.8.2**, MIT. WebGPURenderer and MeshBasicNodeMaterial with TSL nodes; no handwritten GLSL/WGSL shaders. [WebGPURenderer documentation](https://threejs.org/manual/pages/webgpurenderer), [R3F on-demand rendering](https://r3f.docs.pmnd.rs/advanced/scaling-performance).
- Dither: a Bayer threshold inspired by the local **Plinka / React-Beautiful-Gradient** project, expressed as TSL nodes; ASCII uses a local monospace glyph atlas. Plinka attribution and its MIT license are preserved in `legal/plinka-gradient-MIT.txt`. Running MusArt requires no imports from outside this repository.
- Fonts: **Inter** and **Space Grotesk**, variable Latin subsets supplied by Fontsource and served locally. OFL licenses are in `legal/`.
- Segmentation: **SlimSAM**, ONNX weights from `Xenova/slimsam-77-uniform`, Apache-2.0, pinned to revision `5850ab45f587c112167512ffef949107115e26a0`. [Model and license](https://huggingface.co/Xenova/slimsam-77-uniform). Transformers.js runs in a local worker; only model/runtime resources are downloaded, and no image is uploaded.
- Demonstration artwork: original SVG created in `services/projects/demo.ts`; it uses no remote media. Load-test photographs are local Unsplash files in `apps/web/public/benchmark/`, with a SHA-256 manifest and recorded sources/license; ten photographs supply fifty assets. The supplied Figma screenshot is a reference and is not part of the delivered interface.

Versions were installed after inspecting published React/R3F/Vite metadata. TypeScript 5.9.3 is retained for lint-toolchain compatibility; upgrading to a newer major version is a separate task requiring plugin verification. The complete dependency graph is pinned in `bun.lock`.

The `unbound-method` lint exception is restricted to test files: assertions inspect method/spy references without invoking them outside their owning object. Production callbacks declare `this: void` when necessary. Promise rules remain active in tests.
