# Headless mode

Headless mode lets you create or edit a MusArt project from the command line, export an image, or capture the editor without opening a visible browser window.

| Operation    | Result                                      | Needs a running app?          |
| ------------ | ------------------------------------------- | ----------------------------- |
| `create`     | A starter `.musart` project.                | No                            |
| `apply`      | A project changed by a JSON command list.   | No                            |
| `render`     | The selected artboard as PNG, WebP or JPEG. | Yes, plus Playwright Chromium |
| `screenshot` | A screenshot of the editor interface.       | Yes, plus Playwright Chromium |

Run the examples from the repository root. Use the Bun version declared in [package.json](../package.json) and install the locked dependencies first:

```sh
bun install --frozen-lockfile
```

## Create a project

```sh
bun run headless create --output artifacts/demo.musart
```

This creates a 1080 × 1080 white artboard containing a blue “MusArt” text layer. Import the file through the dashboard to continue editing visually. For your own artwork, download a `.musart` project from the editor and use that as input.

## Apply edits

Save this JSON as `artifacts/commands.json`:

```json
[
  { "type": "renameProject", "name": "Headless demo" },
  {
    "type": "updatePage",
    "patch": { "name": "Square poster", "background": "#f8fafc" }
  }
]
```

Then run:

```sh
bun run headless apply \
  --input artifacts/demo.musart \
  --commands artifacts/commands.json \
  --output artifacts/changed.musart
```

Commands use the same validated document engine as the editor. The complete list is applied as one transaction: a rejected edit prevents the changed project from being written. Existing files at the output path are overwritten on success, so use a different path to keep the original.

Each invocation starts on the input project's first artboard. `updatePage` edits the current artboard; an `addPage` command makes the new artboard current for later commands in the same list. Commands that target layers use IDs from the project's `pages[].layers[]`. The full `Command` type is defined in [the document model](../packages/core/src/document/model.ts), and handlers are listed in [the registry](../packages/core/src/session/registry.ts).

## Render an image

Install the Chromium version used by the repository's Playwright dependency:

```sh
bunx playwright install chromium
```

On Linux, if Playwright reports missing system libraries, use `bunx playwright install --with-deps chromium`.

Start the app in one terminal:

```sh
bun dev
```

In a second terminal:

```sh
bun run headless render \
  --input artifacts/changed.musart \
  --output artifacts/poster.png \
  --scale 2
```

The example produces a 2160 × 2160 image of the first artboard. The default format is PNG. To choose another format, pass `--format webp` or `--format jpeg` and use a matching output extension; the filename alone does not select the format.

The CLI connects to `http://127.0.0.1:6100` by default. It can also use a production preview started with `bun run build` followed by `bun run preview`. Use `--url` to select another app address.

## Capture the editor

With the app still running:

```sh
bun run headless screenshot \
  --input artifacts/changed.musart \
  --output artifacts/editor.png
```

This waits for the artboard's rendered revision, then captures the interface at a 1600 × 1000 browser viewport. Use `render` for the artwork by itself.

## Options

| Option       | Applies to             | Behavior                                                                                           |
| ------------ | ---------------------- | -------------------------------------------------------------------------------------------------- |
| `--output`   | All                    | Required destination path. Parent directories are created automatically.                           |
| `--input`    | All                    | Existing `.musart` JSON. If omitted, the starter project is used.                                  |
| `--commands` | `apply`                | Required path to a JSON array of document commands.                                                |
| `--url`      | `render`, `screenshot` | Running app address; defaults to `http://127.0.0.1:6100`.                                          |
| `--page`     | `render`, `screenshot` | Artboard ID from the input project's `pages[]`; defaults to the first artboard.                    |
| `--scale`    | `render`               | Output density; defaults to `1`. Must be positive and at most `8`, within image and device limits. |
| `--format`   | `render`               | `png`, `webp` or `jpeg`; defaults to `png`.                                                        |
| `--webgl`    | `render`               | Force Three.js's WebGL2 backend for the image export.                                              |

Run `bun run headless` without an operation to print the CLI's usage summary.

## Limits and troubleshooting

- `create` and `apply` need no GPU, app server or model download. Rendering launches a real Chromium browser and requires a working WebGPU or WebGL2 backend. The CLI sets its own Linux/Vulkan launch flags; availability depends on the host's drivers and browser support.
- Images export one whole artboard at a time. The CLI has no ZIP, selection-crop or video-export operation; those are available in the editor. Run separate commands to export several artboards.
- Output is limited to 16,384 pixels per side and 64 megapixels, with stricter device/resource limits possible. Excessive output sizes fail rather than silently reducing the requested image. See [texture limits](rendering/texture-limits.md).
- Each browser invocation uses a fresh context. It does not inherit your everyday browser's installed custom fonts or site storage. Use bundled fonts for portable automation; unavailable fonts are reported as errors. See [font portability](fonts.md).
- A connection failure usually means the app is stopped or `--url` points to the wrong address. Project, command, font and rendering failures are reported as errors. A printed destination path indicates that the operation completed.

The browser API is opt-in at `/?automation=1`; the CLI enables it automatically. `window.musart` exposes document snapshots, validated commands/transactions, selection, artboard switching, undo/redo, saving, history access and still rendering. Its exact interface is in [automation.ts](../apps/web/src/services/automation/automation.ts). This is a browser automation adapter; it does not provide a server API or model-driven editing agent.
