# Composition export

The **Exporter** action and each artboard's **Export composition…** menu open the
same panel. The artboard select stores a durable composition ID and initially
chooses the active artboard. Its Radix list retains the shared native scrolling
controls and ScrollShadow. Choosing another artboard never activates or edits it.
Timelapse remains a separate journal/replay export.

The panel captures a canonical project revision and artboard identity. Execution
checks the project ID, composition ID, revision, page identity and actual mode;
the finished file is not downloaded if the document changes during rendering.
Reloading a different snapshot with the same IDs cannot adopt an old request.
Original-media resolution remains scoped to that captured project's storage.

## Static and Motion

Static exports the base design through the existing GPU graph and native image
encoder. Selected content is cropped by default; **Whole artboard** restores its
canvas and background. The explicit ZIP option exports base designs for all
artboards. PNG is the default, at 1×; JPEG/WebP quality defaults to 100%.

Motion exports authored composition timing, evaluated properties, presence,
original video frames, groups, effects and masks. It does not record the screen,
capture the editor playhead or replay edit history. The public
`exportMotionVideo(project, options)` API also runs without the editor.

## Video parameter order and defaults

| Parameter        | Default and contract                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolution       | 1× the chosen composition's width and height, rounded to positive integer pixels. UI scales: 0.5×, 1×, 2×, 3×, 4×.                                                                                                                                                                                                                                                                       |
| Frame rate       | The authored rational numerator/denominator; new compositions use 30/1. Explicit alternatives include 24000/1001, 30000/1001 and 60000/1001.                                                                                                                                                                                                                                             |
| Duration         | Exact authored rational duration; no separate speed or duration override. The frame count is `ceil(duration × fps)`. Samples cover a half-open interval; the final sample is shortened when necessary.                                                                                                                                                                                   |
| Container/codecs | Automatic probes MP4 AVC/AAC, WebM VP9/Opus, then WebM VP8/Opus at the actual resolution, frame rate and audio configuration. Format codec membership is checked too. Explicit MP4/WebM requests never silently change container. MP4 requires AAC when audio is included; MP4/Opus is excluded because its decoded audio padding extended the authored duration in native verification. |
| Video quality    | Target 8,000,000 bits/s, variable bitrate. UI alternatives are 4,000,000 and 16,000,000 bits/s. These are encoder targets, not guaranteed file sizes.                                                                                                                                                                                                                                    |
| Audio            | Included when an audible video source or standalone audio track exists. Default mix: 48,000 Hz, stereo, target 192,000 bits/s; MP4 uses AAC and WebM uses Opus. Disabling audio opens no source-audio decoder.                                                                                                                                                                           |

Audio follows source PTS, source in-points, authored intervals, mute and volume.
The last whole PCM sample is `floor(duration × sampleRate)`; audio does not extend
the authored interval. Mixing and resampling use bounded serial PCM blocks. An
unavailable required audio encoder is an error, never an implicit mute.

Playback workers, solo audition and export use the same PCM processing. Gain is
applied after dry/wet reverb and clip-relative fades. Missing processing preserves
the legacy signal exactly. The reverb is a deterministic finite diffuse delay:
eight normalized feed-forward stages, no feedback, with history bounded by the
chosen decay (0.1–3 seconds) plus at most eight output samples. Sequential blocks
reuse state; a seek rebuilds only that finite history. Fades stay anchored to the
authored clip even when the composition ends earlier. No tail extends beyond a
clip or the composition.

Native decoder sources have a four-entry LRU; this does not limit track count.
Only active reverbs allocate delay history, with a 32 MiB total Float64 state
budget per mixer. Eight 48 kHz stereo reverbs at three seconds require about
18.4 MB. Exceeding the actual budget reports the clip rather than dropping sound.
Gain/fades alone allocate no delay history. The imperative audio-track gain port
publishes at the next PCM block boundary without modifying the plan. Live
gain/mute commits can rebase the mixer's local base
and clear a draft without replacing playback or its clock. Muted audio originals
remain lazy until unmuted. Export uses authored values and clamps the final mix
to [-1, 1]; solo audition can defer that clamp until after its
native gain stage with `clampOutput: false`.

GPU evaluation samples the exact authored rational `frame.time`. Only the
encoded sample boundaries are quantized: WebM uses 1,000 ticks/s (nearest
millisecond, at most 0.5 ms from each authored boundary), and pinned Mediabunny
MP4 uses 57,600 ticks/s without frame-rate metadata (at most half a tick from each
boundary). Duration is the difference of rounded endpoints, so adjacent encoded
samples stay contiguous. The result reports authored `duration` separately from
`encodedDuration` and `timestampResolution`. A zero-length sample or frame rate
beyond the format's grid fails rather than dropping or fabricating a frame.

The reproducible [Mediabunny patch](../../patches/README.md) preserves explicit
WebM video sample durations, including a shortened last sample. It uses the
library's existing BlockGroup/BlockDuration path and does not add alpha data or a
different muxer. Decoder timestamps may additionally round to native WebCodecs
microseconds; native witnesses compare those against the declared container grid.

The exporter awaits each GPU-canvas/encoder consumer before reusing the canvas.
It uses Mediabunny's native CanvasSource and WebCodecs path, without production
GPU pixel readbacks or JavaScript image buffers. Its default work limits are
1,000,000 video frames and 128 MiB of encoded output; callers can supply a bounded
stream target. Unsupported transparent-video export fails before setup.

## Preview and lifecycle

Opening the panel pauses editor presentation without seeking, document commands
or history changes. Closing does not restart editor playback. Motion preview
starts immediately on its own compiled program and local clock. It uses the same
StandaloneRenderer and composition graph, with at most one acknowledged GPU job,
an edge capped at 768 pixels, a 256 MiB GPU budget and a maximum 30 preview frames
per second. Playback, scrubbing and visibility changes remain local to the panel.
The preview is explicitly muted; the audio option controls the delivered file.

Before encoding, the preview is stopped and its renderer disposal is awaited.
Cancel aborts real rendering/encoding, retains the pending gate through cleanup,
and never downloads a partial result. Closing/unmounting releases the preview's
RAF, subscriptions, visibility listener and renderer. Empty output, unsupported
codecs, stale scope and renderer errors remain failures. Progress reaches 100%
only after successful finalization.

The focused native witnesses are `motion-export.spec.ts` (generic renderer,
original video plus timed WAV, rational timestamps, decoded video/audio, both
backends) and `motion-export-ui.spec.ts` (panel captures, decoded delivery,
unchanged document/React counters and observed native backend disposal). Pixel
and PCM inspection run on separate unprobed pages. Artifacts live under
`artifacts/motion/export/`; prepared witnesses are not execution evidence.

Mediabunny 1.62.1 is pinned. Its installed declarations were checked alongside
the primary [writing guide](https://mediabunny.dev/guide/writing-media-files),
[media-source guide](https://mediabunny.dev/guide/media-sources) and
[format/codec guide](https://mediabunny.dev/guide/supported-formats-and-codecs).
