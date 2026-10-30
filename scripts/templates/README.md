# Motion templates

Generate both editable projects without a browser or editor UI:

```sh
bun scripts/templates/generate.ts
```

The generator verifies the checked-in CC0 media hashes, probes the **video stream** with FFprobe, and uses real public core commands. `TemplateAuthor` only orchestrates those commands; it does not inject timeline documents or simulate rendered results. Fixed IDs, timestamps and effect seeds make repeated generation byte-for-byte reproducible.

Install FFmpeg, including its `ffprobe` executable, before running the generator or its source-backed tests. On Ubuntu, use `sudo apt-get install ffmpeg`; the Quality workflow installs this dependency explicitly before verification.

Generated gallery payloads and command journals use compact JSON and are excluded from formatting. Edit their TypeScript builders, then regenerate; the builders remain formatted, and the generated documents still pass the normal length, import and command validation checks.

| Output               | Purpose                                                                                                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<id>.json`          | Gallery bundle: validated project plus a binary-original sidecar manifest.                                                                                                                                                 |
| `<id>.musart`        | Project metadata for headless inspection. Video bytes still require the sidecar; this file is not a self-contained binary-media archive.                                                                                   |
| `<id>.commands.json` | Initial project and ordered command **batches**. Replaying each batch through `EditorEngine.transaction` reproduces the final project. Preserve batch boundaries because initialization plans carry their origin revision. |
| `media/`             | Original licensed files and `sources.json` provenance. The generator never rewrites them.                                                                                                                                  |

| Project           | What it demonstrates                                                                                                                                                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In Bloom          | Five-second video/audio, two stock photographs, three isolated groups, rounded alpha mask, source trim, spring and custom Bézier motion, Hold text changes, animated colour and GPU effects.                                                                                 |
| Motion stress lab | Fifty photo layers, exactly 100 effect instances covering the complete current effect catalog, five bounded row groups, every easing preset, a custom spring, animated effect time/amount, and three video clips with different source in-points, ranges and audio settings. |

The stress project intentionally reuses **three photograph originals and one video original**. Its 50 image layers are a compositing workload, not a claim of 50 unique decoded uploads. The existing unique-image benchmark remains a separate workload.

Each template references the same unchanged flower original once. The exact video span is `150150 / 30000 = 5.005 s`; the container/audio tail is longer and does not define video duration. Both compositions run for five seconds. Muted clips still retain volume and source metadata.

The gallery fetches bounded manifests/originals, verifies SHA-256 and exact byte counts, then invokes the single atomic `openMediaProject` capability. Project identity is fresh on each creation. Unmount or origin changes abort preparation; the service checks the captured project/page/revision before committing. Unsupported installs and storage failures remain real failures.

Cover files must come from the real evaluated Three.js render graph at an explicit timestamp with the original video installed. A generated document or a unit test does not establish GPU correctness, export correctness, or a frame-time budget. Keep native captures and timing reports under ignored `artifacts/`; copy only reviewed final cover images into the public template directory.

With the feature Vite server already running on 6110, reserve the shared GPU slot and run:

```sh
nice -n 15 ionice -c 2 -n 7 bun scripts/templates/render.ts --url http://127.0.0.1:6110
```

The renderer CLI opens a blank document, imports the real core/render modules through Vite, validates original bytes, evaluates the requested exact time, renders with `motionFrame` and a native original resolver, then encodes the GPU canvas as WebP. It never mounts or authors through the editor UI. `--template in-bloom`, `--time 2.4`, `--edge 720` and `--webgl` select a focused capture. The reported cold render includes source/shader preparation and encoding; it is not a steady-state frame-time benchmark. FFprobe must be available for stock metadata generation.
