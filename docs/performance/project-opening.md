# Project and preview timing diagnostics

Development builds (`import.meta.env.DEV`) log `[Melt perf]` groups in the browser console for saved project opening, template installation, new/portable projects and Motion hover previews. Production builds do not enable the logger; there is no runtime setting or localStorage override.

Each operation has an ID, its project/template label, current stage and a final table of stage milliseconds and elapsed milliseconds. `ready` means that a real matching canonical canvas frame was submitted and made visible, or that the retained preview rendered its first frame. It is not a physical display or GPU-duration measurement. `published` means that the service completed without a canvas acknowledgement; cancelled, failed and superseded operations are explicitly identified. Expand the console group or filter the console by `[Melt perf]` when reporting a slow action.

Opening stages separate pending previous-project saves, source reading/validation, save preparation and hashes, durable persistence, document publication and first canvas frame. Preview stages separate previous-owner cleanup, source reading/validation, Motion compilation, GPU-session creation and preparation/rendering of the first frame. No per-frame logging or pixel readback is introduced. Stage durations inside a group are sequential; separate operations can overlap and must not be summed.

## Diagnostic baseline, 2026-10-31

The measurements below use a frozen production build of `58a444b` plus the saved working diff in `artifacts/morph-load-before.patch`. This includes the preview-routing and saturated-brand fixes, before the timing logger was added. Local Chromium 156.0.8078.4, Linux, 1600 × 1000, one browser worker, no CPU throttling, low process priority. Launch flags enabled Vulkan/WebGPU and SwiftShader; the physical adapter was not captured, so these are not hardware-GPU benchmark claims. The CPU profile and worker counters add diagnostic overhead. Each cell is one sample, not a percentile or a general speed guarantee.

| Operation                                    | First measured |   Repeated | Boundary                                                                    |
| -------------------------------------------- | -------------: | ---------: | --------------------------------------------------------------------------- |
| Create Morphing Type from its template       |    11,287.1 ms |          — | Native pointer down → library closes after durable installation/publication |
| Open saved Morph project after previewing it |       663.3 ms |          — | Native pointer down → library closes; this is a warm read                   |
| Hover saved Morph project                    |     1,895.4 ms | 1,323.8 ms | Pointer entry → preview reports its first rendered frame                    |
| Hover Morphing Type template                 |     1,830.4 ms | 1,424.6 ms | Pointer entry → preview reports its first rendered frame                    |

A separate attempted second template creation did not complete the measurement protocol within 45 seconds. It produced no valid completed sample and is not used as a warm timing above. Background hash/journal messages continued during later hover measurements, so the hover samples include that real outstanding work rather than an artificially drained session.

The exact 3,178,623-byte Morphing Type manifest produces 159,947 transport fragments for one thumbnail hash job; 155,560 are fragments beneath coordinate arrays. The encoder currently schedules small numeric coordinate pairs separately. The opening CPU profile also contains substantial task scheduling, message transfer and persistence work. This is a concrete attribution lead, not an implemented optimization.

Raw measurements, frozen diff, CPU profiles and console timing checks remain in ignored `artifacts/`: `morph-open-before.log`, `morph-open-before-0.cpuprofile`, `hover-load-profile.json`, `morph-fragment-count.json`, and `project-timing-native.log`. The development logger now exposes the corresponding stages in the user's actual browser, across project names and template families.

## Retained hover preparation

The preview owner now leases one renderer with its existing 128 MiB GPU cache. Its per-frame abort signal and media resolver are never captured as renderer defaults. Compatible sessions retain shaders, fonts, textures and geometry for 30 idle seconds; visibility/pagehide and HMR explicitly release the owner and resources. Real frame failures retire the session; ordinary cancellation retains it. A font-resolver change retires the incompatible context.

A four-entry, estimated 32 MiB LRU retains validated immutable template sources and one compiled artboard per source. Its conservative accounting includes serialized content, document/compiled copies and original blobs. Saved projects still perform fresh validated storage reads; only exact matching serialized content reuses a prepared identity. Changed source content, errors, cancellation and expired generations cannot reuse stale programs. Oversized documents bypass retention.

A frozen production cohort (`542b42c` plus `artifacts/hover-cache-after.patch` and the new cache sources, build `artifacts/hover-cache-final-dist`) used the same browser, viewport, flags and CDP profiler as the baseline. Concurrent UI changes were present in the saved diff; each value remains a single local sample. The repeated saved Morph hover measured **421.4 ms** (previously 1,323.8 ms); its first hover measured 2,040.2 ms. Repeated template Morph measured **7.5 ms** (previously 1,424.6 ms); its first hover measured 1,840.3 ms. These results demonstrate warm reuse, not a cold-start improvement. The saved-project read/validation still costs time.

The native browser regression verifies the same actual GPU canvas moves from Morph to Orbit and back, remains animated, and fetches the Morph manifest only once. Raw output: `artifacts/hover-load-final.log`, `hover-load-after.json`, `after-*.cpuprofile`, and `hover-cache-native.log`.
