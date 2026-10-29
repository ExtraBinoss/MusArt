# GPU texture dimensions

The renderer checks both memory accounting and per-axis texture limits. A thin
32,768×1 surface is small in bytes but can exceed the acquired device's maximum
texture dimension. Page/export bounds alone do not cover isolated effect layers,
mask/group targets or decoded originals.

`gpuTextureLimit` reads the actual WebGPU device's `maxTextureDimension2D`, or the
active WebGL context's `MAX_TEXTURE_SIZE`. An adapter's higher supported maximum
does not substitute for the device's acquired limit. Validated limits are cached
in a weak map by device/context identity; replacement identities get their own
query, and active previews do not repeatedly query GL capabilities. Missing
initialization fails explicitly rather than inventing a permissive limit.

Every retained target checks dimensions before budget reservation, construction
or resize. A rejected resize preserves the old target. The public effect operator
checks output/scratch admission and its optional glyph atlas. Image sources check
the decoded original's actual dimensions before constructing a texture, including
when portable metadata claims a smaller image. Unsupported content is rejected
with the actual dimensions and device limit. It is not resized on the CPU,
replaced by black pixels or reported as a ready frame.

These are allocation checks, not blanket document-geometry restrictions. Giant
plain primitives which batch directly into a smaller page remain supported. A
failed render keeps the completed presentation target separate from intermediate
child targets; subsequent valid jobs can recover and owned resources remain
explicitly disposable. Original assets and portable documents are not rewritten.

## Native verification

The frozen 2026-10-28 run of `test/browser/gpu-dimension-limits.spec.ts` passes
WebGPU and Three's WebGL fallback in 1.7 seconds each. Actual acquired limits are
8192 px for WebGPU and 16384 px for WebGL. A decoded 8193×1 or 16385×1 PNG,
respectively, is rejected despite its portable metadata claiming 1×1. A 32768×1
effect target is rejected on both backends. Instrumented native texture-allocation
APIs observe zero oversized requests; no fallback black frame is accepted.

The canvas reports a real render error and remains unready for the invalid frame.
A native canvas screenshot before/after a failed edit in the same project is
RGBA-identical, proving the last completed presentation survives. Valid rendering
recovers after each failure. A plain 32768×1 red primitive still renders 64 visible
pixels inside the 64×64 page. Production WebGPU, WebGL and Canvas2D readbacks remain
zero. Decoded originals, errors, device limits, native allocation observations and
the primitive PNG are recorded under ignored `artifacts/gpu-dimensions/`.

The companion five-file unit cohort passes 42 tests, including failed-resize
preservation, unavailable capabilities, actual decoded dimensions, output/scratch
admission, recovery and disposal. A subsequent three-test helper cohort verifies
the cached immutable capability and device/context replacement. These checks run
serially in the same 200% CPU / 2300 MiB memory-high / 3200 MiB hard-limit / zero-swap
scope used by the native validation; they are not performance measurements.
