# Effect library delivery and verification

This is the review entry point for the eleven procedural effects and the shared
rendering fixes. The delivery candidate is **frozen v7**, including the
presentation-before-background barrier. Native rendering, affected regressions
and the final matched performance/storage cohorts pass. Full coverage and its
rules check also pass; release sign-off remains. Earlier measurements retain their original
build attribution.

## Review the effects

The [implementation and acceptance checklist](../effects-expansion-checklist.json)
records each effect's primary visual/algorithm references and evidence paths.
Each linked note explains its controls, native photograph/calibration witnesses,
alpha behavior and visual inspection.

| Effect         | Reference and verification notes      | Deliberate procedural limit                                                                                           |
| -------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Live Ripple    | [Ripple](ripple.md)                   | Image-space refraction with an explicit phase; no fluid simulation.                                                   |
| Shatter        | [Shatter](shatter.md)                 | Refracts a photograph through procedural facets; no physical fracture, glass meshes or path tracing.                  |
| GPU Noise      | [Noise](../noise.md)                  | Seven bounded three-dimensional scalar fields; no simulated material or fluid history.                                |
| Flash Light    | [Flash Light](flashlight.md)          | Photographic illumination; no inferred 3D geometry or surface normals.                                                |
| Cyanotype      | [Cyanotype](cyanotype.md)             | Continuous-tone blue-print interpretation; no chemical reaction model.                                                |
| Circle         | [Circle](circle.md)                   | Adjustable photographic dot screen; no calibrated press or area-exact print simulation.                               |
| One-bit Dither | [One-bit Dither](bit-dither.md)       | Fixed threshold, Bayer and interleaved noise; no error diffusion or claimed blue-noise mask.                          |
| CRT            | [CRT](crt.md)                         | Authored phosphors, scanlines and local glow; no NTSC encoding or temporal phosphor persistence.                      |
| Datamosh       | [Datamosh / Block Smear](datamosh.md) | Spatial photographic approximation; no damaged-video decoding, optical flow or previous frames.                       |
| Receipt        | [Receipt](receipt.md)                 | Prints the source photograph onto procedural paper; no invented receipt text/barcodes or thermal hardware simulation. |
| Pink Phosphor  | [Pink Phosphor](pink-phosphor.md)     | Artistic three-color emission with five-tap local glow; no calibrated HDR/optical bloom.                              |

## Shared behavior to verify

The [authoring contract](authoring.md) describes pure core definitions and strict
settings validation, registry-driven English/French controls, stable GPU uniforms,
and imperative gestures that cancel cleanly or commit once. Radial gizmos edit the
same saved settings under nested owner transforms. Live playback uses explicit
document time, releases its listeners/RAF, and freezes before export capture.

Canvas, thumbnails and export process original sources through the same authored
1× effect/mask reference, then reduce the completed result with premultiplied GPU
mips. They do not change field scale or seed with zoom. Source alpha is retained
unless an effect exposes an intentional coverage control: Circle ink/paper
opacity, Shatter transparent cracks, CRT transparent screen edges, or Receipt
transparent paper edges. Partial coverage and effect amount use premultiplied
interpolation. Production GPU/Canvas pixel reads remain forbidden; inspection
decoding belongs to the test harness.

The [seed/time precision witnesses](seed-time-precision.md) cover adjacent large
uint seeds and large periodic phases. The [transformed groups and Display-P3
verification](groups-p3-verification.md) covers the combined stack, masks and working
color space. [Texture limits](../texture-limits.md) require honest rejection of
unsupported real allocations; previews must not hide such errors with fabricated
pixels or resized originals.

## Frozen v7 provenance

The final executable and matching maps are in
`artifacts/effects-final-cohort-v7-dist/`. Its served index SHA-256 is
`bd450e869491837c51ad3a2fcb611e2b2550c52e67390a0554e3cd8d1ccf8556`.
The [v7 provenance](../../../artifacts/effects-final-cohorts/v7/provenance.json)
preserves the exact source, compiled files and harness. The
[source delta](../../../artifacts/final-v7-source-delta.json) compares all 595
production sources against v6: only PaintYield and ThumbnailPreviews changed.
All core, renderer, shader and effect-control sources retain their verified hashes.

## Historical v6 provenance

- Executable and matching source maps:
  `artifacts/effects-final-cohort-v6-dist/`.
- Served `index.html` SHA-256:
  `618f0191ce606eafe3938e11bb21406ad79de5fbf5ce6360170a495a377314ca`.
- Source base: `75e911610280346e778f79fb9bd1452736e5a75f`, plus the source
  hashes and compiled-file hashes in
  [v6 provenance](../../../artifacts/poster-thumbnails/v6/provenance.json).
- The same directory preserves `source.patch`, `untracked-sources.tar`, and
  strengthened native witnesses in `final-sources/` with
  `final-sources-sha256.json`. Use this snapshot rather than a later working tree
  when reproducing the candidate.

## Rendering and rename regressions included in v6

The v6 provenance manifest identifies the exact source hashes for these changes.
Focused checks retain their original build attribution; the complete v6 rerun is
listed separately below.

| Fix and current source                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Focused evidence and retained failure                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Exact presentation backing.** [drawing-density.ts](../../../apps/web/src/canvas/render/drawing-density.ts) presents the compositor's actual integer frame dimensions before R3F draws. Fractional DPR and thin/non-square pages retain matching backing footprints.                                                                                                                                                                                                     | [v4 correction summary](../../../artifacts/backing-size-draft/v4/SUMMARY.md), `drawing-buffer/{webgpu,webgl}.json` and `reference-surfaces/` in that directory. The earlier actual 158px/159px mismatch is retained under `artifacts/backing-size-probe/confirmed-before/`. Native witnesses: [drawing-buffer](../../../test/browser/drawing-buffer.spec.ts) and [visible Dither comparison](../../../test/browser/dither-preview.spec.ts).                                                     |
| **Cached descendant retention.** [GpuCompositor.ts](../../../packages/render/src/compositing/GpuCompositor.ts) retains existing current-page normal materials using canonical geometry membership; [normal-batch.ts](../../../packages/render/src/compositing/normal-batch.ts) still retires removed/foreign owners.                                                                                                                                                      | `artifacts/backing-size-draft/v4/render-continuity/report.json`; the focused run keeps uniform buffers at 89 before/during/after. Original destroy-hook evidence: `artifacts/normal-retention-probe/confirmed-before/report.json`. Native witness: [render lifecycle](../../../test/browser/render-lifecycle.spec.ts).                                                                                                                                                                          |
| **Tiny selection inside a large plain group.** [group-viewport.ts](../../../packages/render/src/compositing/group-viewport.ts), [GpuCompositor.ts](../../../packages/render/src/compositing/GpuCompositor.ts) and [FrameTexture](../../../packages/render/src/compositing/types.ts) restrict transport targets to the current parent viewport while retaining texel-grid origin and reconstruction margin. Full FX/mask domains and direct mask sources remain uncropped. | [v6 focused summary](../../../artifacts/poster-thumbnails/v6/SUMMARY.md), `group-scope/{webgpu,webgl}.json`, corresponding reference PNGs and `selection-poster-150.json`. Original rejection: `artifacts/poster-thumbnails/blockers.json` (1×11 tick incorrectly requested an 8640×15360 ancestor target). [Group-scope](../../../test/browser/group-scope.spec.ts) and [device-limit](../../../test/browser/gpu-dimension-limits.spec.ts) cases retain full-RGBA and real failure assertions. |
| **Project Rename focus.** [ProjectCard.tsx](../../../apps/web/src/components/projects/gallery/ProjectCard.tsx) focuses the connected, enabled name field after actual modal-menu removal and rejects reopened-menu stale focus. It adds no deferred timer or listener.                                                                                                                                                                                                    | `artifacts/projects-focus/before/timeline.json` records focus stranded on BODY; `artifacts/projects-focus/timeline.json` records the corrected handoff. `artifacts/projects-focus-diagnostic-before.log` fails on v4; `artifacts/projects-focus-diagnostic-after.log` and `artifacts/projects-focus-strict.log` pass on v5. The same source hash is included in v6; its complete [native CRUD witness](../../../test/browser/projects.spec.ts) remains in the final rerun.                      |

These checks establish correctness and resource ownership. Their case runtimes and
the isolated Poster150 regression are not matched before/after latency cohorts.
The preserved failures remain part of the evidence, including the real device
limit rejection; no thumbnail visibility region or acceptance bound was relaxed.

## Final sign-off — pending

### Native regression evidence: v6

The [consolidated native index](../../../artifacts/final-native-v6-summary.json)
matches the original 162-case catalogue by **file, title and Playwright project**.
Every unique case has a passing v6 verification, gathered serially: 112 in batch
one, two Project cases in batch two, 43 in batch three, three corrected UI cases,
one snapping-preferences replay and one 50-image selection case. The last case ran
in three fresh contexts and counts only once. This is an accumulated regression
record, not a claim that every invocation passed: all six earlier failed results
and their reports/captures remain linked in the index.

The focused UI reruns preserve the original behavior assertions. Project-card
motion observation now arms before hover: its diagnostic showed that the previous
RPC began sampling after the cycle ended. Quick Add waits for actual popover
removal and canvas focus before Ctrl+Z; the captured failing key targeted the
closing listbox. Compact theme choices assert their actual 32px plate, 26px radios
and 2px gap, while true connected ButtonGroups retain their ≤1px gap requirement.
Measurement badges still assert the authored 19px fill at every zoom; a separate
check accounts for the 1px SVG stroke in Chromium's 20px protocol bounds. Travel,
variation, decoded pixels, contrast, transactions and undo checks remain intact.
The snapping sandbox now measures its SVG after the real popover entry animation;
the retained immediate/settled probes distinguish a stale coordinate near 220.6
from the unchanged required snapped coordinate 232.

The initial 50-image cold selection of **108.4ms** exceeded the unchanged 100ms
gate and is retained with its profile and attribution. Three predeclared fresh
context reruns passed at **38.5ms, 37.5ms and 62.8ms**. These samples do not erase
the outlier or establish a matched before/after speed improvement. The separate
thumbnail-first-opening failure is retained separately; the v7 barrier fix and
passing matched cohort are outside this historical v6 native result.

### Final v7 affected checks and performance

The final source passes 40 tests across four affected mirrors, full typecheck
and lint, and all six affected native cases in 22.0 seconds. These cover preview
arrival, cached revisits, packet bursts, independent shared-canvas encodes, and
first-switch/inactive-artboard retention. The independent audit's unbounded
per-consumer fence finding was fixed with one shared delivery generation; late
deliveries, cancellation, visibility and disposal retain bounded cleanup.

Fresh baseline and candidate browser processes give **2123.6 → 194.4 ms** from
generated input to six ready thumbnails on first opening. Prepared-cold and
cached dispatch-to-ready results are **799.6 → 150.2 ms** and approximately
**133 → 34 ms**. Both candidate arrival cases pass the unchanged 450 ms guard.
The [complete performance report](../../performance/thumbnail-latency.md)
preserves both clocks, adapter/environment, source identity and earlier failures.

The eleven-effect workload passes with 50 images and 100 effects: all 50 active
regions differ from their neutral references, original hashes and stacks survive
reload, alpha is preserved, and equivalent viewport histories retain exactly
241 targets / 292,094,880 bytes with 97 uploads. The legacy 50-image GPU/storage
case also passes. Production pixel-read hooks remain zero. The
[load report](../../performance/effect-library-load.md) records the complete
memory, export, transaction and recovery evidence; its case runtimes are not
startup speedup claims.

| Gate                                                                               | Candidate status / result location                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native browser regression set                                                      | **Passed:** 162 unique v6 cases indexed in `artifacts/final-native-v6-summary.json`, followed by all six v7 affected cases in `artifacts/effects-final-cohorts/v7/affected-native.log`. Exact source-delta evidence above establishes the unchanged rendering domains.                                                                             |
| Reproducible performance and storage load                                          | **Passed on v7:** fresh matched arrival cohorts, 50-image/100-effect library load and legacy 50-image GPU/storage load. Reports, commands, hashes and captures: `artifacts/effects-final-cohorts/v7/SUMMARY.md` and its provenance.                                                                                                                |
| Full coverage and coverage-aware rules                                             | **Passed:** 559 files / 1,976 tests; statements 95.11%, branches 93.32%, functions 95.77%, lines 95.71%. Core: 99.71% / 98.27% / 100% / 99.89%. All executable sources remain included. `artifacts/final-v7-coverage.log`, `final-v7-coverage-summary.json` and `final-v7-coverage-rules.log` record the unchanged thresholds and zero violations. |
| Frozen install, synchronized version, typecheck, lint, format and production build | Full v7 typecheck/lint and archived production build pass; logs include `artifacts/final-v7-typecheck.log` and `artifacts/final-v7-lint.log`. Final format, synchronized release, frozen-install/version recheck and release build remain pending.                                                                                                 |

Update these statuses only from terminal results for the identified executable.
Release version/date and the delivered feature/fix summary belong in
[CHANGELOG.md](../../../CHANGELOG.md).
