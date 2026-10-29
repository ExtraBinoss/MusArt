# MusArt documentation

Start with the [project README](../README.md) for features, installation and the current roadmap.

## Where things live

| Directory                             | Contents                                                           |
| ------------------------------------- | ------------------------------------------------------------------ |
| [guides/](guides/)                    | Editing workflows, preferences, fonts and headless usage.          |
| [product/](product/)                  | [Product vision and future directions](product/vision.md).         |
| [architecture/](architecture/)        | Module contracts, technology choices and durable history design.   |
| [rendering/](rendering/)              | Composition, GPU effects, text and export implementation.          |
| [performance/](performance/README.md) | Measurement protocols, diagnostic runbooks and attributed results. |
| [legal/](legal/provenance.md)         | Source attribution and preserved third-party notices.              |

## Using MusArt

| Guide                                                               | What it covers                                                        |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [First visit](guides/first-visit.md)                                | The welcome tour, creative tools and keeping your work portable.      |
| [Keyboard shortcuts and Magic Search](guides/keyboard-shortcuts.md) | Find actions, customize shortcuts and copy editable artwork.          |
| [Fonts](guides/fonts.md)                                            | Choose, download or import fonts, and understand project portability. |
| [Preferences](guides/preferences.md)                                | Language, appearance, storage and editor settings.                    |
| [Guides and layout](guides/layout-guides.md)                        | Rulers, safe areas, margins and alignment references.                 |
| [Local object selection](guides/object-selection.md)                | Model download, local processing and offline limitations.             |
| [Headless mode](guides/headless.md)                                 | Create, edit, render and capture projects from the command line.      |

## Contributing

Read the [contribution rules](../AGENTS.md), [architecture contracts](architecture/contracts.md) and [technical stack and choices](architecture/tech-stack.md) before changing the application. [Sources and licenses](legal/provenance.md) records artwork, components, fonts and model attribution; their notices live in [legal/](legal/).

For hosting, see the [GitHub Pages setup](architecture/tech-stack.md#github-pages).

### Editor behavior

- [Selection and transforms](guides/selection.md), [snapping](guides/snapping.md) and [the layer panel](guides/layers.md).
- [Artboard workspace](rendering/artboard-workspace.md), [durable edit history](architecture/history.md) and [timelapse export](rendering/animation-export.md).

### Rendering

- [Composition and blending](rendering/compositing.md), [selection export](rendering/selection-export.md) and [texture limits](rendering/texture-limits.md).
- [Analytical text](rendering/analytical-text.md) and [thumbnail lifecycle](rendering/thumbnails.md).
- [Effect library and verification](rendering/effects/verification.md), [effect authoring](rendering/effects/authoring.md), [procedural noise](rendering/noise.md) and [gradient ports](rendering/shader-ports.md).
- [Three.js integration](rendering/three-webgpu.md), [TSL conventions](rendering/tsl.md) and [R3F timer compatibility](rendering/fiber-timer-compatibility.md).

### Performance and release evidence

The [performance runbooks](performance/README.md) cover interaction, layout, storage and rendering investigations. Use the [measurement protocol](performance/protocol.md) for resource limits and reproducibility, and the [50-image GPU protocol](rendering/performance-protocol.md) for rendering workloads.

[Thumbnail latency](performance/thumbnail-latency.md), [effect-library load](performance/effect-library-load.md) and the [0.2.0 verification record](rendering/effects/verification.md#final-sign-off--020) preserve measured results with their source and environment. They describe specific builds, rather than certifying every later change. Raw captures and generated reports belong in ignored `artifacts/` and are not included in a fresh checkout. Release summaries are in [CHANGELOG.md](../CHANGELOG.md).
