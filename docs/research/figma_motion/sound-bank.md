# Sound bank: ready canvas waveforms and fast audition

The verbatim requests are M125–M130 in [the user brief](user-brief.fr.md).
This follow-up targets the bank. Its current fifteen sounds are original MusArt
TypeScript recipes; no Cinetic recordings or third-party sound assets were imported.

## Required experience

- Every visible item immediately shows its genuine, prepared waveform in a canvas.
- The silhouette is a filled mountain rising from the bottom, without bars or a
  mirrored centerline. Unplayed pixels are gray; played pixels become green.
- Playback progress follows the native audio clock and does not render React on
  each frame. Only the active item needs an animation-frame loop.
- Hover audition starts promptly. Leaving, closing, scrolling away, hiding the
  page or changing documents cancels the appropriate pending/active preview.
- Keep the list compact. Remove repeated explanatory/loading text and unnecessary
  placeholders. Any credits belong behind an information action beside the title.
- Separate Whoosh, Impact, Pop, Riser and Tone groups with compact markers. Keep
  category filtering, the shared virtual-list admission and themed scroll shadows.

## Diagnosed costs and implementation boundaries

The previous bank waits 150 ms per hover, starts a new mixer worker, decodes its
WAV again and closes that worker after each audition. Its WAV/peak cache is only
1 MiB, smaller than the complete bank; waveforms are requested only on hover.

The replacement keeps the actual WAV quantization and original-media identity.
A small dedicated worker can prepare unprocessed bank PCM without invoking the
timeline's effect mixer. Authored track effects and export retain their existing
shared DSP. Native AudioBuffer instances remain platform resources, never project
data.

| Resource                     | Bound and lifetime                                                 |
| ---------------------------- | ------------------------------------------------------------------ |
| WAV cache                    | 2 MiB; fifteen original recipes total approximately 1.1 MiB        |
| Mono PCM/native buffer cache | 4 MiB; approximately 2.2 MiB for the complete bank                 |
| Gray/green canvas atlas      | 8 MiB; keyed by palette, dimensions and DPR; retired bitmaps close |
| Preparation                  | One worker, finite serial prewarm, priority for the intended cue   |
| Playback                     | One active native source and one active canvas-progress loop       |

Authentic envelopes are generated headlessly before UI integration. A synchronous
canvas paint of that geometry may precede its worker bitmap; it is the same shape,
not a placeholder. Worker atlases and chunking are useful only while they improve
the bounded workload. No production pixel readbacks are permitted.

Preview ownership uses its own tokens, independently of document track IDs. A
closing bank or retired task must not stop a newer audition. Cold AudioContext
setup, preparation, native start and warm cached playback are measured separately.
Native source start is not a certified physical speaker-output timestamp.

## Task checklist

- [x] Identify the fixed hover delay, repeated worker/decode and undersized cache.
- [x] Generate and validate authentic envelopes for every preset.
- [x] Implement bounded worker preparation and separate WAV/PCM caches.
- [x] Add per-item canvas mountains with theme/DPR-aware gray/green painting.
- [x] Drive progress from the native clock with zero React frame updates.
- [x] Preserve cancellation, ownership, disposal and explicit failure handling.
- [x] Replace the old preview footer with compact item controls and optional Info.
- [x] Verify real WAV/PCM parity, cache accounting, cleanup and stale-result paths.
- [x] Verify native audition, pointer/focus changes and canvas output in Chrome.
- [x] Measure actual interaction work, editor commits and production read APIs.
- [x] Add the English changelog entry and prepare the separate bank milestone.

## Baseline

The frozen production-bank baseline used the real Sound Playground template in
Chrome. CPU allocation was 90% for the browser/driver, 5% for the production
preview and 5% for the development server, with one worker and no swap.
Bright riser took 1,284.9 ms from native pointer entry
to `AudioBufferSourceNode.start` on its first audition and 388.7 / 436.9 ms on two
warm auditions. Each opened another mixer worker and issued 22 original-PCM reads.
Native AudioContext creation at bank opening took 99.1 ms; PCM copies across all
three auditions took only 3.6 ms. The replacement must be compared using the same
driver before claiming a measured improvement. Raw traces belong in ignored
`artifacts/motion/perf/`, rather than the portable project.

## Verified bank milestone

The pre-audit production comparison measures Bright riser native starts at
35.9 / 35.1 / 35.0 ms, with 4.6 / 4.9 / 4.8 ms main-thread JavaScript and zero
local React commits during those three hovers. One retained worker prepares the
recipes and atlas at opening; no worker job runs during these auditions. One
mono native buffer is reused. The original bank required 1,284.9 / 388.7 /
436.9 ms and a fresh mixer per hover. These are native scheduling boundaries,
not physical speaker latency. The pre-audit executable predates the final
StrictMode, category-header and virtual-list changes; its measurements are not
relabeled as a final whole-editor frame-budget result.

Actual Chromium 156, WebGPU, Intel Xe LPG and DPR 1 checks then pass the grouped
virtualized bank on the development server in 33.3 seconds. All fifteen actual
Blob WAV SHA-256 digests and every PCM16 sample match the headless originals.
Visible canvases remain 16 pixels high; scrolling reaches all fifteen sounds and
five group markers without mounting the whole list. Optical inspection verifies
the filled lower baseline, gray shape, green prefix against the real native clock,
and identical gray output after stopping. Real AudioContext suspension is used
only to freeze the optical specimen, never to measure latency.

The production pre-audit proof passes in 14.4 seconds, and the real imported-WAV
playback/volume/undo check passes in 15.8 seconds. All instrumented production
GPU, WebGL, Canvas2D and VideoFrame pixel-read APIs remain at zero. The initial
Node JSON-import and screenshot focus-background test defects were corrected in
the harness, without relaxing original hashes or audio parity checks.

An independent review identified the hover disappearance: development StrictMode
replayed layout setup after disposal, leaving a closed painter with newly
registered null paths. The painter now explicitly reacquires its lifecycle and
rebuilds paths. Focused tests cover this replay, virtualized registration, cached
buffers, owner-safe late completion, cancellation and bounded high-DPR surfaces.
