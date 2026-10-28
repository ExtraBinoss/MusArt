# Stabilization status

This development snapshot preserves the current implementation and Git history. It is not a release. Release notes remain under `Unreleased` until the complete validation cohort passes.

## Current focus

- Keep the last valid canvas visible during property changes and movements.
- Create text frames with click-drag, one committed edit and safe cancellation.
- Invalidate thumbnails only when their rendered dependencies change.
- Stabilize AFTERHOURS layer scrolling and canvas panning.
- Keep durable history preparation off the immediate gesture path and serialize editor saves without weakening cross-session conflict checks.
- Bound native worker message cloning and move full manifest IndexedDB reads/writes away from the editor thread. Worker execution alone does not remove the synchronous cost of sending a large document.

## Verified so far

Focused mirrored tests cover the changed domains, including snapshot capture, queued writes, undo, cancellation, stale results and cleanup. Selected real Chromium checks cover canvas continuity, text drawing, thumbnail invalidation, native worker fingerprints, real dock/layer drops, responsive Inspector controls and Motion/reduced-motion behavior. Independent agents have reviewed the affected renderer, engine, thumbnail and virtual-list code.

An isolated pan cohort passed its existing frame-pacing and application-overhead budgets after retaining the zoom label and ruler strips. A separate selection cohort passed its selection and held-move checks, but releasing a 10,000-element move still cost about 201 ms at its two-RAF observation boundary. A later diagnostic also found delayed follow-up inputs while persistence was pending. These are different measurement boundaries and source snapshots; neither establishes that the final large edit is instantaneous.

The journal now captures lightweight engine transitions and prepares/persists them in its own worker. Its generic fragment transport bounds nested arrays and strings. The thumbnail hasher uses the same transport for certified immutable engine pages; external mutable callers retain call-time snapshot semantics. The first native hashing regression passed with exact SHA values and no instrumented GPU, WebGL or Canvas pixel readbacks. Large-project responsiveness must still be measured with all persistence changes integrated.

These focused results do not replace the complete coverage and browser gates. Reports and captures are generated locally under ignored `artifacts/`.

## Open validation

- The reported React maximum-update-depth error has not been reproduced in the current color-picker stress checks. Do not describe it as resolved without a reproducer.
- The final canonical 10,000-element commit and immediate follow-up input remain performance blockers. Diagnose the actual submission, native message-clone and manifest transaction windows separately.
- Full manifest persistence worker integration, thumbnail fingerprint reuse and their failure/concurrency checks are in progress.
- Repeat pan, virtual layer scrolling, selection and project restoration against the final frozen production build; earlier cohort results do not certify later source changes.
- The full coverage-aware rules check, production browser cohort, 50-image/effects workload and 100,000-entry history benchmark must pass before a release is prepared.

Reproduce the complete gates with `bun run check`. Start with [the performance runbooks](performance.md) for domain ownership, exact timing boundaries, isolated native workload commands and failure triage. The [GPU load protocol](rendering/performance-protocol.md) and [durable history](history.md) contain the rendering and persistence contracts.
