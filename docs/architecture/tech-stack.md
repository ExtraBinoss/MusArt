# Technical stack and choices

MusArt is a browser-based creative editor. Projects are stored on the device and can be downloaded as editable `.musart` files. Editing does not require an account or an application backend.

## Application

| Technology                        | Role and reason                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Bun and strict TypeScript         | One workspace toolchain for the app, reusable packages and command-line tools, with shared typed document contracts.     |
| React and Vite                    | The editor interface and development/production builds.                                                                  |
| Jotai                             | Interface state such as selection presentation and open controls; the document engine owns saved edits.                  |
| Tailwind CSS, shadcn/ui and Radix | Shared styling and accessible dialogs, menus, tabs and controls. Copied components retain their provenance and licenses. |
| Motion                            | Interface transitions that respect reduced-motion preferences.                                                           |
| i18next and react-i18next         | English and French interface resources.                                                                                  |

Exact dependency versions are pinned in [package.json](../../package.json) and `bun.lock`. Version numbers across the application and workspaces stay synchronized.

## Rendering

**Three.js WebGPURenderer** owns GPU rendering, **Three.js Shading Language (TSL)** defines effects, and **React Three Fiber** presents the result in the editor. Three's WebGL2 backend provides the fallback when WebGPU cannot initialize. Both backends use the same effect definitions and composition graph.

Images, masks, effects and isolated layer groups remain in GPU textures between passes. The editor renders on demand; a static document does not need a continuous render loop. Parameter gestures preview through stable subscriptions and GPU uniforms, then commit one validated edit and one undo entry when the gesture ends.

The export path uses the same composition graph and browser encoders. Application code does not copy rendered GPU pixels into JavaScript arrays. Resource caches and pending work are bounded and explicitly disposed. See [composition](../rendering/compositing.md), [Three.js integration](../rendering/three-webgpu.md) and [TSL conventions](../rendering/tsl.md) for the implementation contracts.

## Documents and local storage

The reusable document engine is independent of React, browser APIs and GPU objects. It validates edits, handles undo/redo and supplies the same commands to the interface and headless tools. Related commands can be applied as one atomic transaction.

The web app uses **IndexedDB**, through **idb**, for local projects, original assets, fonts and the durable edit journal. Frequently changed document metadata is kept separate from original image bytes and large history records. Workers handle selected persistence and preparation jobs; revision checks prevent stale work from overwriting newer edits.

Portable `.musart` JSON includes the document and its original image assets. Fonts remain separate browser-library resources: custom font files must be installed in each browser/profile that opens the project. There is no built-in cloud synchronization or collaboration service. See [font portability](../guides/fonts.md), [history](history.md) and [storage contracts](../performance/storage.md).

## Text, selection and export

| Technology                                 | Role                                                                                                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OpenType.js and HarfBuzz.js                | Prepare font outlines and text shaping; analytical curve coverage is rendered on the GPU.                                                                                      |
| Fontsource and the checked-in font catalog | Local interface fonts, bundled editing fonts and metadata for on-demand font downloads.                                                                                        |
| Transformers.js and pinned SlimSAM weights | Optional object selection in a local worker, using WebGPU or a WASM fallback. Model/runtime files download on first preparation; images remain on the device.                  |
| Browser image encoders and fflate          | PNG, WebP and JPEG export, plus ZIP downloads of multiple artboards.                                                                                                           |
| Mediabunny and browser media APIs          | MP4/WebM timelapse encoding, subject to the browser's actual codec support.                                                                                                    |
| Playwright Chromium                        | Browser rendering and screenshots for [headless mode](../guides/headless.md), as well as real-browser verification. Document creation and command application need no browser. |

## Repository map

| Location          | Owns                                                                             |
| ----------------- | -------------------------------------------------------------------------------- |
| `packages/core`   | Portable documents, validation, commands, geometry, history and replay.          |
| `packages/render` | Three.js resources, source preparation, composition, effects, caches and export. |
| `packages/assets` | Shared font, icon, shape and preset catalogs.                                    |
| `apps/web`        | React interface, editor state, canvas integration and browser adapters.          |
| `scripts`         | Headless CLI, release tooling and repository checks.                             |

Vitest covers document behavior and module contracts. Playwright exercises native browser interactions, GPU output and decoded exports. Oxlint, ESLint, Oxfmt and TypeScript provide static checks. The [contribution rules](../../AGENTS.md) define which checks a change requires; the [performance runbooks](../performance/README.md) define measured workloads.

## GitHub Pages

The [Quality workflow](../../.github/workflows/quality.yml) runs `bun run check-ci` before its Pages build and deployment jobs. This checks versions, repository rules, types, lint, formatting, full Vitest coverage, coverage-aware rules and the production build, without installing Chromium or running Playwright. Browser scenarios remain available through `bun run test:browser` and the complete `bun run check` release gate; they do not block automatic Pages publication.

Deployment is restricted to `ExtraBinoss/MusArt`, the `main` branch, and push/manual runs whose original actor and triggering actor are both `ExtraBinoss`. Pull requests and forks run verification without publishing the site.

In repository **Settings → Pages**, select **GitHub Actions** as the source. The workflow deploys through the `github-pages` environment to `https://extrabinoss.github.io/MusArt/`; the URL becomes available after the first successful deployment.

Keep `github-pages` restricted to `main`, with `ExtraBinoss` as its sole required reviewer and administrator bypass disabled. Self-review must remain allowed so the owner can approve their own deployment. The `main` ruleset requires pull requests, owner review, resolved conversations and the `verify` check; its only bypass is the `ExtraBinoss` user. These controls are configured in GitHub settings separately from the workflow and [CODEOWNERS](../../.github/CODEOWNERS) files.

Vite reads `MUSART_BASE_PATH` for the hosted path. The workflow obtains it from GitHub's Pages configuration; local development defaults to `/`. To preview the project path locally:

```sh
MUSART_BASE_PATH=/MusArt/ bun run build
MUSART_BASE_PATH=/MusArt/ bun run preview
```

Open `http://localhost:6100/MusArt/`. Projects and installed fonts belong to the browser origin: data saved on localhost is separate from data on the hosted site. Download a `.musart` file to move a project, and install its custom fonts separately.

## Attribution

The project is MIT licensed. Bundled fonts, models, copied components and artwork retain their own notices. See [sources and licenses](../legal/provenance.md) and [legal/](../legal/).
