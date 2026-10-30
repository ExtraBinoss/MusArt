# Rendering performance runbook

The document graph uses React Three Fiber, Three.js `WebGPURenderer` and TSL.
Three's WebGL fallback runs the same graph. GPU textures remain on the GPU;
production code must not call pixel readback APIs into JavaScript.

## Ownership

| Domain              | Source                                    | Responsibility                                                                    |
| ------------------- | ----------------------------------------- | --------------------------------------------------------------------------------- |
| Composition         | `packages/render/src/compositing/`        | Retained targets, ordered batches, masks and blends                               |
| Primitive runs      | `compositing/primitives/`                 | Bounded instancing and decoded paint cache                                        |
| Text                | `packages/render/src/surface/text/`       | text-shaper, curves, instanced analytical coverage and leased fonts               |
| Effects             | `packages/render/src/effects/`            | Individual TSL factories and shared scratch targets                               |
| Live display        | `apps/web/src/canvas/render/`             | One retained renderer, latest-only preparation and display plane                  |
| Drawing density     | `canvas/render/drawing-density.ts`        | Shared imperative DPR configuration for rendering and Fiber resizing              |
| Presentation signal | `state/session/canonical-presentation.ts` | Engine-scoped request/draw tickets; no React subscriptions                        |
| Journal scheduling  | `services/animation/`                     | FIFO metadata work behind useful canonical submission; forced durability on flush |
| Metadata transport  | `services/serialization/fragments/`       | Shared bounded codec, immutable leaf reuse and abortable task boundaries          |

## Diagnose an interaction

1. Reproduce against an immutable production build with its exact source maps.
   Record browser, GPU adapter, viewport, DPR, document dimensions and layer/effect counts.
2. Capture the native input timestamp, handler entry, RAF response and CPU profile.
   Record actual readback hooks, renderer instances, target/uniform/program counts
   and React commits. A whole-profile total does not attribute one input window.
3. Separate document transaction, React/DOM work, source preparation, GPU submission,
   browser frame opportunities and background persistence. Include a follow-up input
   while the journal and autosave are pending; moving work after one frame can still
   block the next interaction.
4. Match profile locations to that build's source maps. Keep the original failing
   report and repeat the same workload after changing the measured cause.

### Presentation boundary

| Diagnostic                 | Interpretation                                                                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Submission timestamp       | `canonicalPresentedAt` is recorded from the display scene's `onAfterRender`, after Three submits its render pass.                                           |
| Metric limitation          | It is not a GPU completion fence or a physical-display timestamp.                                                                                           |
| RAF witness                | A later RAF witness is an upper bound with its own scheduling delay.                                                                                        |
| Canonical barrier          | The presentation barrier waits for the latest canonical ticket, then a frame/task boundary; previews and superseded requests cannot satisfy a newer commit. |
| Bounded fallback and drain | Hidden, headless and failed-renderer paths remain bounded, and explicit flush/disposal drains accepted journal entries without depending on a future frame. |

### Worker transport

| Diagnostic            | Interpretation                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Worker responsibility | The journal worker owns replay diffing, fingerprints, logical accounting and its IndexedDB connection.                                  |
| Response              | It returns a small header rather than a delta or document.                                                                              |
| Message limits        | The shared metadata codec limits inline structure to 32 KiB and individual string pieces to 8,192 characters.                           |
| Array deferral        | Every nonempty array is deferred, including nested short arrays.                                                                        |
| Immutable leaves      | The encoder receives an owned immutable DTO and can retain unchanged frozen leaves without manufacturing a path/tuple for every scalar. |
| Measurement limit     | These limits bound the message payload; native clone time and operating-system pauses still need measurement.                           |

Normal captures contain current asset descriptions and newly changed originals.
Initialization and recovery can resolve the complete real source pool. Worker
restart retries preserve operation identity; an uncertain initialization is reported
without reapplying its old snapshot. See [history](../architecture/history.md) for cursor/epoch
and failed-write recovery semantics.

## Common regressions

- **Gray flashes:** loading visibility must depend on initial/artboard presentation,
  not whether the latest property revision is pending. Preserve the last valid plane
  and texture through property changes and same-artboard resizing. Across artboards,
  preserve stable leased destination backdrops, hide the old canvas until the matching
  page is drawn, and keep initial loading separate from current-frame readiness.
- **Warm activation:** `GpuCompositor.retainedFrame` accepts exact engine-certified
  immutable inputs only. Its output belongs to the existing bounded LRU and can be
  evicted; no page, asset pool or texture receives an additional strong cache owner.
- **Sharp text becomes blurry after browser resize:** compare `data-render-width`
  with the actual canvas width. Fiber reuses its retained `dpr` configuration on
  resize; it must agree with the graph's density, including unchanged zoom.
- **Unexpected contexts or targets:** edits reuse the existing renderer and bounded
  graph cache. Check allocation counters and disposal rather than inferring ownership
  from an unchanged screenshot.
- **Device loss:** preserve Three's native diagnostic, stop submissions and reject
  false ready states. Restore only callbacks owned by the adapter. Do not hide a
  driver failure behind an automatic renderer restart loop.
- **Delayed next input:** inspect replay diff/freeze, worker message cloning,
  IndexedDB cloning/accounting and autosave snapshot costs as well as draw calls.

## Focused checks

```sh
bunx vitest run apps/web/test/canvas/render apps/web/test/state/session/canonical-presentation.test.ts apps/web/test/services/animation
bunx playwright test test/browser/render-lifecycle.spec.ts test/browser/text-rendering.spec.ts
bunx playwright test test/browser/primitives.spec.ts test/browser/gradient-effects.spec.ts
bunx playwright test test/browser/journal-responsiveness.spec.ts
bunx playwright test test/browser/hashing.spec.ts test/browser/journal-worker.spec.ts
```

Use one native GPU workload at a time. Preserve reports/screenshots in ignored
`artifacts/`. Still/video exports must validate decoded pixels through a separate
test inspector; an application readback mock does not prove GPU correctness.
Run the complete quality gates and the 50-image/effects and large-history cohorts
before delivery, as required by `AGENTS.md`.

### Native journal evidence

| Diagnostic         | Interpretation                                                                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input boundary     | `journal-responsiveness.spec.ts` records native input immediately after the real submission timestamp while journaling remains pending.                                                  |
| Report contents    | Reports in `artifacts/journal-worker-response/` include real `postMessage` duration, header size, frame gaps, long tasks, native IndexedDB call/result timings and a screenshot.         |
| Report retention   | Set `MUSART_JOURNAL_REPORT` for another output directory so a failed baseline remains available.                                                                                         |
| Fault injection    | The journal fault cases deliberately lose one accepted acknowledgment or drop a metadata fragment; they verify exact-once recovery, atomic rejection and retirement of a partial worker. |
| Real platform APIs | Their injection does not replace the real Worker or IndexedDB implementation.                                                                                                            |
