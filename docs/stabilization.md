# Stabilization status

This development snapshot preserves the current implementation and Git history. It is not a release. Release notes remain under `Unreleased` until the complete validation cohort passes.

## Current focus

- Keep the last valid canvas visible during property changes and movements.
- Create text frames with click-drag, one committed edit and safe cancellation.
- Invalidate thumbnails only when their rendered dependencies change.
- Stabilize AFTERHOURS layer scrolling and canvas panning.
- Keep durable history preparation off the immediate gesture path and serialize editor saves without weakening cross-session conflict checks.

## Verified so far

Focused mirrored tests cover the changed domains, including snapshot capture, queued writes, undo, cancellation, stale results and cleanup. Selected real Chromium checks cover canvas continuity, text drawing, thumbnail invalidation and native worker fingerprints. Independent agents have reviewed the affected renderer, engine, thumbnail and virtual-list code.

These focused results do not replace the complete coverage and browser gates. Reports and captures are generated locally under ignored `artifacts/`.

## Open validation

- The reported React maximum-update-depth error has not been reproduced in the current color-picker stress checks. Do not describe it as resolved without a reproducer.
- The most recent selection workload still has failures against the existing 100 ms thresholds. Further measurements must use the final frozen production build.
- Pan and layer-scroll frame pacing are still under investigation; zero React commits or GPU submissions alone do not prove smooth presentation.
- The full coverage-aware rules check, production browser cohort, 50-image/effects workload and 100,000-entry history benchmark must pass before a release is prepared.

Reproduce the complete gates with `bun run check`. Native workload commands and measurement definitions are documented in [the GPU load protocol](rendering/performance-protocol.md) and [durable history](history.md).
