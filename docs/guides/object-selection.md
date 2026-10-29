# Local segmentation: contract and verification

## Processing ownership

| Model topic        | Details                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| Worker and privacy | Segmentation runs in the selection worker. Images are not uploaded to a server.                      |
| Embedding reuse    | The encoder retains embeddings for one image; subsequent clicks reuse them and run only the decoder. |
| Magic wand         | The magic wand uses a deterministic connected flood fill independently of the model.                 |

## Model and dependencies

- Model: `Xenova/slimsam-77-uniform`.
- Immutable revision: `5850ab45f587c112167512ffef949107115e26a0`.
- Precision: `fp32` for both ONNX sessions. Quantized variants are not assumed to be compatible with the decoder.
- Model license: Apache-2.0, stated in the [model card at the pinned revision](https://huggingface.co/Xenova/slimsam-77-uniform/resolve/5850ab45f587c112167512ffef949107115e26a0/README.md).
- Runtime: `@huggingface/transformers@4.3.1`, pinned with its ONNX Runtime dependency in `bun.lock`; Transformers.js uses Apache-2.0 and ONNX Runtime uses MIT.

| Model topic          | Details                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| First-use resources  | The first use downloads configuration, the processor, both ONNX weight files, and the WASM runtime. |
| Explicit preparation | The interface explicitly requests this preparation.                                                 |
| Backend fallback     | WebGPU is attempted when available; initialization failure triggers a WASM retry.                   |
| Request bounds       | The client accepts one active request and rejects stale responses.                                  |
| Cleanup              | Closing the session terminates the worker and releases its resources.                               |

## Cache and operation without remote network access

| Model topic       | Details                                                                                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Progress          | The model manager reports the pinned model's real download bytes and percentage, then shows initialization separately from download completion.                                                                           |
| Pinned model size | Its four required Hub files total **39,834,751 bytes**, according to the [pinned Hub metadata](https://huggingface.co/api/models/Xenova/slimsam-77-uniform/revision/5850ab45f587c112167512ffef949107115e26a0?blobs=true). |
| Size boundary     | This is the logical model size, not physical browser storage or the shared runtime.                                                                                                                                       |
| UI updates        | Progress callbacks are coalesced per known file, with no per-chunk UI message flood.                                                                                                                                      |

### Preparation and model management

| Model topic               | Details                                                                                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker lifecycle          | Preparation stays inside the selection worker and never requests page navigation.                                                                                                            |
| Development reloads       | The development configuration explicitly prebundles the lazy ML dependency, because [Vite can otherwise reload when it discovers a new dependency](https://vite.dev/guide/dep-pre-bundling). |
| WASM CPU bound            | WASM uses one thread to keep fallback CPU demand bounded.                                                                                                                                    |
| Model controls            | Users can cancel preparation, inspect cached model data, reload it and remove its files.                                                                                                     |
| Deletion                  | Deletion first releases the local worker and uses the same origin lock as model loading; other model IDs and the shared ORT runtime cache are preserved.                                     |
| Failures and project data | Cache failures remain real errors. The model controls and project data have independent lifecycles.                                                                                          |

Transformers.js 4.3.1 enables `useBrowserCache` and `useWasmCache` by default when Cache API is available. The second setting caches **both the WASM binary and its `.mjs` JavaScript factory**, in addition to the weights. This is necessary to start a new worker without contacting a CDN. See the [official environment settings API](https://huggingface.co/docs/transformers.js/api/env).

The real verification observed these six entries in `transformers-cache`:

1. The pinned model's `preprocessor_config.json`.
2. The pinned model's `config.json`.
3. `onnx/vision_encoder.onnx`.
4. `onnx/prompt_encoder_mask_decoder.onnx`.
5. The pinned runtime's `ort-wasm-simd-threaded.asyncify.mjs`.
6. The same runtime's `ort-wasm-simd-threaded.asyncify.wasm`.

### Offline verification boundary

| Model topic           | Details                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Observed reuse        | A new worker then ran both WASM sessions with **all HTTPS requests blocked**: it did not even attempt a remote request.          |
| Local module          | The local server continued serving the application's worker module.                                                              |
| What this establishes | This establishes model/runtime reuse after download; it does not establish initial application loading from an unreachable host. |
| Secure context        | Cache API requires a secure context, supplied by HTTPS or localhost.                                                             |
| Eviction              | Clearing or evicting this cache requires another download.                                                                       |

No additional locally hosted ORT files are required for this verified version. A preloaded standalone installation can host them and configure `env.backends.onnx.wasm.wasmPaths`, but the `.mjs` and `.wasm` paths must belong to the same pinned version; do not point to a "latest" CDN. The [official configuration guide](https://huggingface.co/docs/transformers.js/en/custom_usage) describes this option.

## Executed measurements

Verified on October 27, 2026 in Playwright's headless Chromium on Linux with Vulkan. **Adapter hardware classification was not recorded for this segmentation run.** These timings describe that environment and are not promises for users' machines.

Reference image: [corgi.jpg from the official documentation](https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/corgi.jpg), 614 × 410 pixels. Three prompts: `(340,250)`, `(345,255)`, and `(350,260)`.

| Actual execution path                                     | Model preparation | First click, including encoding | Second click, reusing embeddings | Third click |
| --------------------------------------------------------- | ----------------: | ------------------------------: | -------------------------------: | ----------: |
| WebGPU, empty browser cache, including download           |          9,106 ms |                        7,083 ms |                           214 ms |      206 ms |
| WASM, new worker, populated cache, remote network blocked |          1,969 ms |                       11,193 ms |                           391 ms |      378 ms |

Both session configurations were read from the loaded model: `device: webgpu` for the first path and `device: wasm` for the second. Each mask contains exactly `614 × 410 × 4` RGBA bytes. The three WebGPU masks contain 18,162, 18,309, and 18,357 selected pixels respectively, with transparent pixels outside the selection; alpha is either 0 or 255.

The detailed report, `artifacts/segmentation.json`, is ignored by Git. It records timings, the sessions actually selected, the alpha histogram, and cached files. Vite HMR messages from the worker harness are retained in `consoleErrors`; no ONNX inference error was observed.

## Reproduction

Start the development server, then run the verification in another terminal:

```sh
bun run dev
bun scripts/verify-segmentation.ts
```

`MUSART_BASE_URL` selects a different development server. The script imports the **production SAM module** into a real worker and uses **real model weights**. It fails if a mask is empty, entirely opaque, or incorrectly sized, if loading fails, or if WASM recovery without remote network access fails. It writes a report even after an error. The browser uses the Vulkan launch options required by this headless environment; those flags alone do not establish the adapter's hardware classification.

This verification downloads resources and measures variable timings, so it remains separate from `bun run test:coverage`. Deterministic tests use port doubles to control errors, fallback, embedding reuse, and stale responses. Canvas screenshots and GPU exports are verified separately by the project's Playwright workflows.
