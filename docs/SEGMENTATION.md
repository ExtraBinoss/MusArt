# Local segmentation: contract and verification

Segmentation runs in the selection worker. Images are not uploaded to a server. The encoder retains embeddings for one image; subsequent clicks reuse them and run only the decoder. The magic wand uses a deterministic connected flood fill independently of the model.

## Model and dependencies

- Model: `Xenova/slimsam-77-uniform`.
- Immutable revision: `5850ab45f587c112167512ffef949107115e26a0`.
- Precision: `fp32` for both ONNX sessions. Quantized variants are not assumed to be compatible with the decoder.
- Model license: Apache-2.0, stated in the [model card at the pinned revision](https://huggingface.co/Xenova/slimsam-77-uniform/resolve/5850ab45f587c112167512ffef949107115e26a0/README.md).
- Runtime: `@huggingface/transformers@4.3.1`, pinned with its ONNX Runtime dependency in `bun.lock`; Transformers.js uses Apache-2.0 and ONNX Runtime uses MIT.

The first use downloads configuration, the processor, both ONNX weight files, and the WASM runtime. The interface explicitly requests this preparation. WebGPU is attempted when available; initialization failure triggers a WASM retry. The client accepts one active request and rejects stale responses. Closing the session terminates the worker and releases its resources.

## Cache and operation without remote network access

Transformers.js 4.3.1 enables `useBrowserCache` and `useWasmCache` by default when Cache API is available. The second setting caches **both the WASM binary and its `.mjs` JavaScript factory**, in addition to the weights. This is necessary to start a new worker without contacting a CDN. See the [official environment settings API](https://huggingface.co/docs/transformers.js/api/env).

The real verification observed these six entries in `transformers-cache`:

1. The pinned model's `preprocessor_config.json`.
2. The pinned model's `config.json`.
3. `onnx/vision_encoder.onnx`.
4. `onnx/prompt_encoder_mask_decoder.onnx`.
5. The pinned runtime's `ort-wasm-simd-threaded.asyncify.mjs`.
6. The same runtime's `ort-wasm-simd-threaded.asyncify.wasm`.

A new worker then ran both WASM sessions with **all HTTPS requests blocked**: it did not even attempt a remote request. The local server continued serving the application's worker module. This establishes model/runtime reuse after download; it does not establish initial application loading from an unreachable host. Cache API requires a secure context, supplied by HTTPS or localhost. Clearing or evicting this cache requires another download.

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
