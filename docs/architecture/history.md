# Durable project history

| History topic     | Contract                                                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Journal ownership | The journal is separate from both the project manifest and the engine's short undo stack.                                     |
| Retention         | The default retention is **10,000 completed transactions**, adjustable per project from **10 to 100,000** entries in Animate. |
| Excluded activity | Pointer previews, selection changes and viewport navigation do not produce entries.                                           |
| Atomic entry      | A completed multi-command transaction produces one entry.                                                                     |

On first launch, the shared Projects/Templates dashboard owns an empty draft that exists only in memory. It creates no saved project, journal or preview. Opening or creating a real project activates autosave, history and preview scheduling synchronously; edits immediately after that choice are recorded. The explicit automation and benchmark entry points retain their seeded fixtures for reproducible verification.

## Storage and access

| History topic    | Contract                                                                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema history   | The journal uses four independent stores introduced in schema 3, checkpoint indexing from schema 4 and independent page thumbnails from schema 5.           |
| Current schema   | The current database schema is 6: an optional unique compound index on `[projectId, operationId]` supports retry acknowledgments without a parallel ledger. |
| Upgrade behavior | The upgrade creates the native index without a JavaScript event scan; legacy events lacking operation IDs remain unchanged and unindexed.                   |
| Legacy epoch     | Existing metadata receives one durable epoch lazily when initialized.                                                                                       |

| Store           | Contents                                                          | Normal access                    |
| --------------- | ----------------------------------------------------------------- | -------------------------------- |
| `journalMeta`   | Capacity, cursors, count, enabled state, last content fingerprint | One small header                 |
| `journalBase`   | Initial state or the last pruned checkpoint                       | Replay preparation and retention |
| `journalEvents` | Ordered deltas, action summaries, occasional checkpoints          | Pages of at most 100             |
| `journalAssets` | One immutable original per asset ID                               | Import and replay preparation    |

Project loading and project autosave do not scan historical entries. Original image bytes never enter a command delta or checkpoint. Command summaries identify actions; playback applies the authoritative deltas, avoiding duplicate inserted-layer geometry in command payloads. Checkpoints omit redundant deltas.

Replay diffing indexes stable identities once for bulk property changes. Moving one item within an otherwise unchanged ID order is recognized by a linear scan and stored as one move, followed by any field edits at their final indices. General permutations and insertions/removals retain the full diff path; arbitrary reorderings are not claimed to have linear cost. Applying a replay batch copies each changed container once and leaves its source state untouched.

### Observation ports

| History topic             | Contract                                                                                                                                                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Summary port              | `EditorEngine.subscribeCommitInfo` publishes frozen command types and the committed immutable snapshot without copying full command payloads.                                                                                                                                |
| Detailed port             | Detailed `subscribeCommands` observation remains available and clones its payload only when detailed listeners exist.                                                                                                                                                        |
| Portable recording        | `observeReplay` defaults to synchronous full-command behavior for portable `recordSession` recordings.                                                                                                                                                                       |
| Scheduled journal capture | A platform journal can opt into `commandMode: "summary"` and supply a scheduler: the observer captures before/after state references, originals, timestamp and checkpoint sequence synchronously, then computes and freezes its delta only when the scheduled emission runs. |
| Callback snapshot         | Its callback receives that exact captured snapshot as the third argument.                                                                                                                                                                                                    |
| Custom-engine fallback    | Custom engines without the metadata port fall back to detailed observation and type summaries.                                                                                                                                                                               |

The scheduler owns FIFO ordering, awaiting callback promises and reporting asynchronous failures. Emissions are idempotent; removing the subscription stops new captures but leaves already scheduled commits drainable, so disposal can flush them. No browser timer, rendering API or storage dependency enters the pure core observer.

The engine captures commit envelopes before notifying snapshot subscribers and drains them in transaction order. A command, undo or load triggered by either a snapshot subscriber or a commit observer keeps its own immutable snapshot; it cannot replace the earlier event's state. Commit-observer failures are rethrown after queued committed transitions reach the other observers, preserving their order and the already-applied document state.

When detailed observers are present, their command payload is detached before handler execution. Later commands in the same transaction and callbacks mutating the caller's array cannot rewrite that payload. Failure to capture it rejects the transaction before state publication; summary-only observation does not allocate this extra copy.

### Worker capture and transport

| History topic           | Contract                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Captured frame          | The browser journal captures `observeReplayTransitions` metadata synchronously and queues its immutable frame behind the retained canvas's actual canonical submission signal. |
| Worker responsibility   | Its owned module worker computes deltas, command summaries, fingerprints and logical accounting, then writes IndexedDB.                                                        |
| Baseline ownership      | Only a small header returns to the UI; the worker retains one metadata baseline, with no original-image pool.                                                                  |
| Restart                 | A restarted or failed baseline forces a checkpoint.                                                                                                                            |
| Preference-only updates | Metadata-only preference changes cannot mark an unpersisted frame as the delta baseline.                                                                                       |
| Yield and input checks  | Transport yields real browser tasks between bounded fragments and rechecks pending input and presentation.                                                                     |
| Message bounds          | Both nested structures and strings participate in the message budget; the worker also bounds its assembled frame.                                                              |
| Ordinary frame          | Ordinary commit frames include current asset descriptions and changed originals, rather than repeating every unchanged data URL.                                               |
| Original recovery       | Initialization, reset and recovery resolve actual originals from the capture or durable stores; missing bytes are an error.                                                    |
| Clone cost boundary     | These are ownership and scheduling contracts, not a claim that native message cloning costs nothing.                                                                           |

### Drain and hashing

| History topic            | Contract                                                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drain                    | Explicit flush and disposal drain accepted FIFO work, including tasks which have not started yet.                                                                                                                                     |
| Unavailable presentation | Hidden, headless or unavailable-renderer paths remain bounded.                                                                                                                                                                        |
| Resource ownership       | Every pending timer, frame, listener, connection and worker has an owner.                                                                                                                                                             |
| Capture time             | Event timestamps and document snapshots are captured at commit time, independently of when preparation runs.                                                                                                                          |
| Compatibility path       | The no-Worker compatibility path preserves journal values and failures through the existing history adapter; its main-thread costs require separate measurement.                                                                      |
| Hash worker              | Project-owned canonical hashing runs in one lazy module worker.                                                                                                                                                                       |
| Payload                  | The worker prepares paint metadata, canonical JSON and SHA-256; no original image bytes enter its history or thumbnail jobs.                                                                                                          |
| Compatibility            | Existing hashes remain byte-compatible.                                                                                                                                                                                               |
| Admission and cleanup    | Eight admitted snapshots bound native message clones; the worker computes FIFO, cancellation rejects callers promptly and frees admission on acknowledgment, and failure/disposal terminates the worker and rejects pending requests. |
| No-Worker fallback       | Environments without Workers use the same algorithm and snapshot inputs before computing.                                                                                                                                             |
| Multi-artboard hashes    | Multi-artboard saves admit two thumbnail hashes at a time rather than posting the entire project at once.                                                                                                                             |

The event store has compound indexes for project order and checkpoints. Reducing capacity seeks the latest checkpoint in the removed prefix, applies only its remaining deltas, advances the base and deletes the old range atomically. Ordinary retention prunes in small batches. Native IndexedDB transactions protect the metadata, original pool, checkpoint and event changes together.

SHA-256 fingerprints cover canonical portable metadata, excluding original bytes. They are calculated before opening write transactions. This detects a restored document whose timestamp was preserved. Concurrent writers use sequence checks; a divergent writer inserts a self-contained checkpoint. An interrupted write is reported and the next successful write reconciles document state and missing originals.

### Operation retries and epochs

| History topic                 | Contract                                                                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operation identity            | Worker-bound history operations carry a bounded durable ID, their originating epoch and an expected sequence.                                                                                     |
| Atomic deduplication          | The operation index is checked inside the same transaction as the event write.                                                                                                                    |
| Accepted retry                | A repeated accepted operation returns its own original sequence acknowledgment and the current header without changing payloads, timestamps, accounting or retention.                             |
| Concurrent and stale retries  | A first attempt can reconcile a concurrent writer with a checkpoint; an absent retry whose cursor has advanced is explicitly stale, including when its former event has been pruned.              |
| No guessed append             | It is never guessed to be a new event.                                                                                                                                                            |
| Clear epoch                   | Clearing changes the epoch atomically.                                                                                                                                                            |
| Repeated clear                | Repeating that same clear acknowledges it without deleting entries written afterward; a superseding reset rejects the old operation.                                                              |
| Recording changes             | Recording mode changes also advance the epoch so a previously skipped disabled write cannot become an ambiguous enabled retry.                                                                    |
| Configuration changes         | Configuration IDs guard repeated preference operations against later configuration changes.                                                                                                       |
| Retired projects and rollback | All paths check project retirement before acknowledging or writing, and failed transactions leave no deduplication acknowledgment behind.                                                         |
| Enable checkpoint             | Enabling recording reconciles its captured state with one checkpoint using the configuration operation's same durable ID.                                                                         |
| Lost response                 | A lost response cannot append that checkpoint twice.                                                                                                                                              |
| Local sequence                | Header acknowledgments retain the local operation's own sequence separately from another writer's newer global cursor.                                                                            |
| Uncertain initialization      | Initialization has no replayable operation identity: if its completion becomes uncertain, the client reports that uncertainty instead of automatically reapplying an old initialization snapshot. |

### Document write conflicts

| History topic             | Contract                                                                                                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Revision guard            | Project document writes also read a small durable preference revision before asynchronous hash preparation and compare it again inside the manifest write transaction.                              |
| Stale writes              | A concurrent committed save or rename makes an older prepared write fail with `StaleProjectWriteError`; timestamps do not decide ordering, so deliberate sequential undo/import saves remain valid. |
| Immutable input           | Save inputs are cloned and frozen before the first await, preventing a caller mutation from mixing one paint revision with another manifest.                                                        |
| Atomic revision           | The revision token advances only in the successful transaction and rolls back with failed payload/history writes.                                                                                   |
| Thumbnail-only writes     | Thumbnail-only metadata retains its separate pixel-revision guard and does not invalidate document writes.                                                                                          |
| Portable payloads         | These small concurrency tokens stay outside portable project/history payloads.                                                                                                                      |
| Editor baseline           | The editor's `saveCurrent` path retains the revision observed by atomic load or its last successful write in a bounded 128-entry header cache.                                                      |
| Unknown existing projects | It rejects stale loaded sessions and requires reopening an unknown existing project; only an actually absent record may be created without a baseline.                                              |
| Explicit replacement      | Explicit import/replacement uses raw `save`, which intentionally establishes a new baseline.                                                                                                        |
| Guarded callers           | Runtime autosave, manual editor saving and active rename use the guarded path.                                                                                                                      |
| Utility reads             | Utility reads for duplication, history management and background thumbnails explicitly avoid adopting an editor baseline; only a real project open/reopen does so.                                  |
| Unchanged restore         | Restoring an unchanged project performs no redundant save.                                                                                                                                          |
| Recovery record           | Journal entries remain a recovery record even when a stale editor's manifest save is rejected.                                                                                                      |
| Save acknowledgment       | A recovered local commit does not claim that its project manifest was saved successfully.                                                                                                           |
| Visible conflict          | The save error propagates to the editor, the newer session's manifest remains intact, and the stale editor must reopen or explicitly resolve the conflict.                                          |
| Preserved local edits     | This preserves unsaved local edits without silently replacing another session's document.                                                                                                           |

### Deletion and retired identities

| History topic        | Contract                                                                                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Atomic delete        | Deleting a project atomically removes its manifest, originals, previews and journal, and retires its ID with a small durable preference marker.                              |
| Concurrent writes    | Manifest and journal writes check that marker while holding the same IndexedDB transaction locks, including writes from other sessions that started hashing before deletion. |
| Delayed work         | A delayed save, history initialization or history reset therefore reports a deleted-project error without recreating payloads.                                               |
| Rollback             | Failed deletion rolls the marker back with the payload changes.                                                                                                              |
| Reimport             | Deliberately importing the deleted `.musart` file creates a fresh UUID; the old identity remains retired.                                                                    |
| Accounting and reads | These markers do not enter project payload accounting, and replay reads still access only the four journal stores.                                                           |

## Playback and export

Opening Animate requests one history page. Preparing a timelapse explicitly reads a consistent bounded journal snapshot in batches. The engine validates it, indexes checkpoints and caches neighboring states. Subsequent scrubbing evaluates transforms and effects without modifying the document or its undo history.

The journal can be downloaded as a separate `*-history.json` file. A normal `.musart` export contains the document and originals. Video uses the retained GPU canvas and Mediabunny; see [video encoding](../rendering/animation-export.md).

## Verification

Mirrored tests cover transactions, pagination, fingerprints, resume, write errors, immutable originals and retention. Independent audit tests check cold reads, atomic rollback and final replay state.

| History topic        | Contract                                                                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Native workload      | `test/browser/history-performance.spec.ts` seeds **100,000 entries over 50 layers** in native IndexedDB, measures cold opening, pages, retention and replay preparation, and counts actual IndexedDB reads/writes. |
| Report               | It writes timings and logical serialized payload sizes to `artifacts/performance-history.json`.                                                                                                                    |
| Size interpretation  | Logical JSON size is not an estimate of browser database allocation.                                                                                                                                               |
| Environment boundary | The report records its browser and machine context; timing results are specific to that environment.                                                                                                               |
