# MusArt documentation

Start with the [project README](../README.md) for features, installation and the current roadmap.

## Using MusArt

| Guide                                                        | What it covers                                                        |
| ------------------------------------------------------------ | --------------------------------------------------------------------- |
| [Keyboard shortcuts and Magic Search](keyboard-shortcuts.md) | Find actions, customize shortcuts and copy editable artwork.          |
| [Fonts](fonts.md)                                            | Choose, download or import fonts, and understand project portability. |
| [Preferences](ui/preferences.md)                             | Language, appearance, storage and editor settings.                    |
| [Guides and layout](ui/guides.md)                            | Rulers, safe areas, margins and alignment references.                 |
| [Local object selection](SEGMENTATION.md)                    | Model download, local processing and offline limitations.             |
| [Headless mode](headless.md)                                 | Create, edit, render and capture projects from the command line.      |

## Contributing

Read the [contribution rules](../AGENTS.md), [architecture contracts](CONTRACTS.md) and [technical stack and choices](Tech_stack.md) before changing the application. [Sources and licenses](PROVENANCE.md) records artwork, components, fonts and model attribution; their notices live in [legal/](legal/).

For hosting, see the [GitHub Pages setup](Tech_stack.md#github-pages).

### Editor behavior

- [Selection and transforms](selection.md), [snapping](interaction/snapping.md) and [the layer panel](ui/layer-panel.md).
- [Artboard workspace](rendering/artboard-workspace.md), [durable edit history](history.md) and [timelapse export](rendering/animation-export.md).

### Rendering

- [Composition and blending](rendering/compositing.md), [selection export](rendering/selection-export.md) and [texture limits](rendering/texture-limits.md).
- [Analytical text](rendering/analytical-text.md) and [thumbnail lifecycle](rendering/thumbnails.md).
- [Effect library and verification](rendering/effects/verification.md), [effect authoring](rendering/effects/authoring.md), [procedural noise](rendering/noise.md) and [gradient ports](rendering/shader-ports.md).
- [Three.js integration](rendering/three-webgpu.md), [TSL conventions](rendering/tsl.md) and [R3F timer compatibility](rendering/fiber-timer-compatibility.md).

### Performance and release evidence

The [performance runbooks](performance.md) cover interaction, layout, storage and rendering investigations. Use the [measurement protocol](performance/protocol.md) for resource limits and reproducibility, and the [50-image GPU protocol](rendering/performance-protocol.md) for rendering workloads.

[Thumbnail latency](performance/thumbnail-latency.md), [effect-library load](performance/effect-library-load.md) and the [0.2.0 verification record](rendering/effects/verification.md#final-sign-off--020) preserve measured results with their source and environment. They describe specific builds, rather than certifying every later change. Raw captures and generated reports belong in ignored `artifacts/` and are not included in a fresh checkout. Release summaries are in [CHANGELOG.md](../CHANGELOG.md).
