# Persistence and large-project diagnostics

Read [Protocol](protocol.md) before timing a cohort and [Durable project history](../history.md) before changing the journal. This page separates document persistence from source decoding, GPU preparation and background previews. It does not claim that an older local report describes the current build.

## Ownership and contracts

| Responsibility                                                   | Source                                                                                                                                                                                                           |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manifest/original separation, transactions and write generations | [ProjectStore](../../apps/web/src/services/projects/storage.ts), [database schema](../../apps/web/src/services/projects/database.ts)                                                                             |
| Captured immutable save inputs                                   | [snapshotProject](../../apps/web/src/services/projects/writes/snapshot.ts), [engine publication certificate](../../packages/core/src/document/published.ts)                                                      |
| Per-editor FIFO and autosave/disposal barriers                   | [ProjectWriteQueue](../../apps/web/src/services/session/project-write-queue.ts), [runtime](../../apps/web/src/services/session/runtime.ts)                                                                       |
| Cross-session compare-and-swap and retired project IDs           | [write revisions](../../apps/web/src/services/projects/writes/revision.ts), [project lifecycle](../../apps/web/src/services/projects/lifecycle.ts)                                                               |
| Canonical metadata fingerprints and byte accounting              | [hashing](../../apps/web/src/services/serialization/hashing), [records](../../apps/web/src/services/projects/records.ts), [usage](../../apps/web/src/services/projects/usage.ts)                                 |
| Bounded journal reads, retention and retry semantics             | [history service](../../apps/web/src/services/history), [history contract](../history.md)                                                                                                                        |
| Worker journal preparation and header acknowledgments            | [processor](../../apps/web/src/services/animation/journal/processor.ts), [worker host](../../apps/web/src/services/animation/journal/host.ts), [client/transport](../../apps/web/src/services/animation/journal) |
| Thumbnail jobs, cached blobs and object-URL leases               | [thumbnail pipeline](../../apps/web/src/services/projects/thumbnails), [visible row previews](../../apps/web/src/components/layers/rows/LayerThumbnail.tsx)                                                      |

The current database schema is **6**. Version-2 project records keep small asset metadata in the manifest and original data in a separate asset store. Loading one project restores its referenced originals; it must not scan its journal events. Runtime journal initialization may read its own small header, which is a different boundary from `ProjectStore.load`.

Only validated, deeply frozen publications certified by the engine may bypass full save-input cloning and repeated validation. A shallowly or deeply frozen external object is not a certificate. External inputs are detached and frozen before an await. An engine mutation after capture must not change the earlier queued save's values. The certificate uses a private weak identity set; it is not serialized and does not retain projects.

Writes remain compare-and-swap operations even when their input can be reused. A stale loaded session, a project retired during asynchronous preparation, or a closed store must fail explicitly. A rejected manifest save does not imply that a recovery journal has replaced the newer manifest. Do not resolve these failures by silently retrying an old snapshot as an unconditional replacement.

## Project persistence worker boundary

[ProjectStore](../../apps/web/src/services/projects/storage.ts) captures the expected durable write revision before hashing. Its [persistence client](../../apps/web/src/services/projects/persistence/client.ts) owns one lazy worker, admits at most eight manifest/blob mutations and 128 lightweight read controls, and runs them through one FIFO. These limits are separate: mounting many artboards must not consume the eight-snapshot budget just to request thumbnail headers. The public save resolves only after a validated acknowledgment of the actual transaction.

The worker assembles the captured document from bounded fragments, then [writes the manifest, originals, counters and preference atomically](../../apps/web/src/services/projects/persistence/transaction.ts). Hash preparation and transport finish before that transaction opens. Inside the transaction, only IndexedDB requests are awaited. Original-asset comparison uses a checked durable basis; a basis mismatch aborts without writes and permits a full-original resend with the same captured document revision. It never adopts a newer revision to force an old snapshot through compare-and-swap.

[Thumbnail writes](../../apps/web/src/services/projects/persistence/thumbnail.ts) and [thumbnail header/blob reads](../../apps/web/src/services/projects/persistence/reads.ts) use the same worker. This keeps full-manifest cloning out of the background preview path too. The write merges live headers and accounting under its transaction lock and rejects stale pixel revisions. Responses contain only small revision headers or requested thumbnail blobs, never a full document or original asset strings. Thumbnail metadata is captured before validation and queue admission; the Blob itself is immutable.

The shared fragment assembly accepts at most **128 MiB of logical input**, counting UTF-16 strings and structural overhead. This is neither the compressed image-file size nor browser disk usage. A document permitted by the core may still exceed the worker transport budget, particularly with encoded original strings. Assembly then rejects before opening a write transaction; it must not silently switch to an unbounded main-thread save. A worker unavailable at startup uses the same extracted transaction directly, with its main-thread costs reported separately.

A known transaction failure remains a real rejection. Losing the acknowledgment after the final request was sent instead produces `UNCERTAIN_PROJECT_WRITE`: the transaction may have committed, so reopen and inspect the durable project before deciding how to retry. The client does not automatically replay an uncertain save. Closing stops new admission, drains already accepted writes to their actual outcomes and releases the worker. Cleanup completion does not turn a rejected write into success. A closed generation cannot adopt later revision/asset caches; a load finishing in that generation rejects, while an already committed rename retains its durable result without restoring the closed cache.

Stored manifests also name the thumbnail renderer schema. Loading an older schema
awaits bounded worker hashing of a private snapshot of the actual stored document,
before exposing mutable caller input. A metadata-only transaction compares the
captured document write token, original-asset revision, page IDs and old schema,
and checks deletion and store generation again before writing. It updates only
thumbnail revisions, the renderer marker and manifest byte accounting. It never
renews the document write token, edits the portable document, rewrites original
assets or touches the journal. A concurrent opener that already computed the same
schema/hashes is accepted; a foreign document or newer schema is not overwritten.
After a successful current canonical save, the runtime schedules thumbnails again,
so a background result rejected before autosave caught up cannot remain missing.

For focused verification, run the persistence mirrors together with `storage.test.ts`, `storage-concurrency.test.ts` and `storage-crud.test.ts` using the resource limits in [Protocol](protocol.md). Preserve real IndexedDB regressions for atomic rollback, tombstones, stale sessions, close races, mutable thumbnail callers, special asset IDs and lost acknowledgments. Mock worker transport tests establish message/lifetime behavior; frozen native input measurements are still required to establish the responsiveness improvement.

## Measure the actual boundary

| Observation                                       | Meaning                                                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `automation.load()` returns                       | Synchronous engine publication; it does not prove a rendered frame or saved project                                 |
| `ProjectStore.load()` returns                     | Referenced document and originals have been assembled and validated                                                 |
| Runtime automation becomes available after reload | Application document readiness, including runtime initialization                                                    |
| Expected page/revision is rendered                | Useful GPU frame after decoding, source preparation and composition                                                 |
| `services.saveProject()` resolves                 | The accepted editor snapshot completed its ordered manifest write; background history/previews may still be pending |
| Runtime `flush()` resolves                        | Autosave, journal and the editor writer have drained                                                                |
| Runtime `flushThumbnails()` resolves              | The preceding flush and scheduled project previews have drained                                                     |
| IndexedDB transaction completes                   | Its atomic writes committed; this does not establish browser disk allocation or GPU readiness                       |

Capture each boundary separately. A slow reload can contain little IndexedDB time but substantial document cloning, validation, source decoding or shader preparation. Likewise, a fast canonical canvas frame can be followed by a blocking journal response. Include a real input immediately after a large committed edit; do not flush that work away before every responsiveness measurement.

Journal acknowledgments separate the operation's own next sequence from the current global header. Another writer may have advanced that header after the local operation succeeded. A repeated clear still acknowledges its own reset cursor; it does not adopt remote events as a local delta baseline. Metadata-only configuration persists no document state, so it cannot validate a failed or foreign mirror. The next stateful commit must reconcile that baseline with a checkpoint. Keep these distinctions when changing worker responses or retry code.

## Reproducible native workloads

Use the frozen build and ignored browser configuration from [Protocol](protocol.md). Run serially with no competing browser, coverage, build, lint or TypeScript workers:

```sh
bunx playwright test test/browser/selection.spec.ts --grep 'images-50' --config artifacts/performance.config.ts --workers=1
bunx playwright test test/browser/selection.spec.ts --grep 'elements-10000' --config artifacts/performance.config.ts --workers=1
bunx playwright test test/browser/history-performance.spec.ts --config artifacts/performance.config.ts --workers=1
bunx playwright test test/browser/journal-responsiveness.spec.ts --config artifacts/performance.config.ts --workers=1
```

[The selection helper](../../test/browser/support/selection-profile.ts) saves the project, removes the `benchmark` URL parameter and reloads through the normal runtime path while retaining automation. It records API readiness without a full document snapshot, then waits for the actual canonical renderer frame. Only after both boundaries does it clone a verification snapshot, check the project ID/layer count and assert one completed asset-store `get` per restored original. Reads are restricted to those started by the document-readiness cutoff; `verificationMs` reports the observer's separate cost. `?benchmark=50` intentionally constructs a fixture on startup; leaving it on the reload URL measures fixture reconstruction instead of persisted restoration.

The historical local report `artifacts/selection-images-50-pre-real-idb.json` preserves that invalid persistence baseline and its explanation. Its former reload times must not be presented as IndexedDB restoration results. Earlier correctly restored reports also cloned their verification snapshot before recording document/useful-frame readiness; those bounds include observer work and are not directly comparable to the revised protocol. Selection/rendering samples have their own boundaries and are not automatically invalidated by a storage harness defect. Generate a fresh report after changing the harness or storage implementation rather than copying old values into release claims.

The 100,000-entry journal fixture writes the current schema directly through native IndexedDB. It includes cumulative event-byte accounting and cached metadata, and checkpoint records omit duplicate deltas. This keeps migration/backfill work out of a current-format benchmark. Preserve its assertions for zero journal-event reads on cold document load, at most 100 entries per page, local checkpoint pruning, exact final replay state and accounting consistency.

Reports are written under ignored `artifacts/selection-*.json` and `artifacts/performance-history.json`. Archive each report together with its CPU profile, exact executable/source maps, command and environment before another run overwrites the fixed filename.

## Attribute CPU and storage separately

Record actual IndexedDB requests with store/key category, request completion and transaction completion. A callback interval includes browser scheduling; it is not pure disk time. Avoid logging original asset strings or adding serialization of large documents inside measured RAF callbacks.

For a separate diagnostic run, attribute native `structuredClone`, worker `postMessage`, canonical JSON construction, SHA preparation, validation and browser encoding. Main-thread message cloning can be expensive even when the hash/diff itself runs in a worker. Native `toBlob` callbacks and original-image decoding belong to different stages. Instrument actual readback APIs through [the shared probe](../../test/browser/support/readback-probe.ts); browser encoding does not require JavaScript access to GPU pixels.

Use the exact save/release/input window for CPU attribution. Whole-profile totals can include idle time, prior thumbnails, browser tooling and later reload work. Preserve both the diagnostic trace and a clean non-tracing rerun.

Check actual message sizes and the synchronous work before each yield. An item-count limit alone does not bound a structured clone: nested short arrays of vector parts, effects or text can multiply one message's payload. The fragmented journal transport needs a structural/string budget per part as well as a bound on the assembled input. Exercise nested valid documents and retain the native cloning/input profile; passing a rectangle-only chunk test does not establish that complex shapes stay responsive.

## Memory and bounded work

| Owner                           | Current bound / lifetime                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Editor write queue              | 128 accepted snapshots, persisted FIFO; failures remain observable                                                   |
| Project persistence worker      | Eight accepted manifest/blob mutations and 128 lightweight read controls; one active request, drained on close       |
| Fragment assembly               | 128 MiB logical UTF-16/structure input; rejects before a write transaction if the budget is exceeded                 |
| Observed write-revision headers | 128 project IDs; no original bytes                                                                                   |
| Canonical hash worker           | Eight admitted jobs; explicit error, timeout and disposal paths                                                      |
| Certified page digest memo      | Weak page keys and exact certified original-collection identity; one computation per live pair, reset on store close |
| Active original comparison map  | The most recently opened/saved project's originals                                                                   |
| Original digest cache           | 128 entries / 64 MiB of retained source strings; explicit cache cleanup is available                                 |
| Project thumbnail queue         | Eight project requests, coalesced to the latest snapshot                                                             |
| Selected-content previews       | 32 pending jobs; cached 512 blobs within 8 MiB                                                                       |
| Thumbnail render session        | 384 MiB GPU resource budget, identical full original sources and fixed reference effect planes                       |
| Thumbnail object URLs           | 80 entries / 32 MiB while unleased; active leases stay valid until release                                           |

The preview key follows the selected paint dependency closure, including processing ancestors, nested descendants, enabled masks, original assets and color space. Selection or unrelated metadata changes must not regenerate every visible preview. Visible row requests use bounded task admission, are abortable and canceled on leave/unmount; one edited layer should enqueue its affected previews rather than all mounted rows. See [Layout](layout.md) for the corresponding native job-count and virtual-scroll checks.

Measure browser-process RSS, JavaScript heap, DOM nodes, retained object URLs and renderer cache counters independently. An active engine document and undo history legitimately retain immutable state. A bounded cache is not automatically a leak, and summing browser-process RSS does not establish GPU-memory consumption. Compare before/after loading a smaller document and after complete runtime disposal, with the same diagnostic collection method each time.

## Failure triage

| Symptom                                         | Inspect first                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Save blocks before its first await              | Snapshot cloning/freezing, validation, manifest accounting and worker message cloning                  |
| Fast write request, late completion             | Transaction work, a competing writer, native scheduling or another main-thread task                    |
| Document ready quickly, useful frame much later | Source decode/geometry, shader compilation and GPU preparation; see [Rendering](rendering.md)          |
| Every row thumbnail changes after a local edit  | Global revision keys, unstable original identities, or a missing selected dependency closure           |
| Project opens by scanning history               | Cold-load boundary, legacy accounting backfill, or eager replay preparation                            |
| Save loses another session's edits              | Missing captured baseline or transaction compare-and-swap; retain the stale-write rejection            |
| Deleted project returns later                   | Generation/retirement checks around asynchronous preparation and the final transaction                 |
| First next input after commit is blocked        | Journal response assembly/clone/apply, hashing/accounting callbacks and their actual scheduling window |
| Memory stays high after disposal                | Pending snapshot ownership, leased URLs, worker termination and renderer/source cache cleanup          |

Regression tests should verify captured values, atomicity, retry/clear/delete races, bounded reads and cleanup. Keep a native restore and actual next-input case for changes to these boundaries; fake IndexedDB timings and mocked workers do not establish browser responsiveness.
