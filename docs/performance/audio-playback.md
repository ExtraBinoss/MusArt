# Audio/video playback startup

## Confirmed problem

The user identified the delay specifically when pressing **Play**. The previous
transport advanced its visual clock immediately, while its audio subscriber
resumed WebAudio, initialized a new mixer worker and opened every audible source
in the composition. The mixer kept four readers, so preparing many sequential
originals also evicted the first clip before reading its first block.

Scheduling then anchored audio to the already-advanced timeline. The first decode
could exceed the 10 ms native lead; expired blocks were decoded and dropped one
by one. This lost a cue's attack instead of starting audio and video together.
A presentation gap over 500 ms also recreated the worker, adding preparation to
an already late frame. The earlier waveform optimizations do not address this
playback path.

## Changes and limits

- An owned transport buffering lease parks the presentation clock through native
  resume, mixer setup and the first real PCM block. That block schedules with the
  usual 10 ms lead, and the transport resumes against the same start. Nested,
  paused, sought, replaced and disposed leases cannot restart a newer session.
  Ping-pong's reverse phase is retained. Buffering owns no animation-frame loop.
- Live worker initialization admits original readers only for intersecting
  audible lanes. A silent video is discovered normally and updates the worker's
  audio-presence metadata. Errors are reported when their original is required;
  offline export keeps eager validation and its existing decoded output contract.
- Adjacent live blocks reuse genuine source PCM from an 80 ms read-ahead window.
  Its separate LRU holds at most four sources and 2 MiB; eviction and disposal
  remove retained arrays. This does not enlarge the four-node / 40 ms native
  scheduling lookahead or change volume-preview commit policy. Source decode
  windows retain the existing one-second and native allocation budgets.
- A slow presentation frame preserves its mixer. Before requesting the next PCM
  block, scheduling skips obsolete sample ranges using the native clock. Each
  pump admits at most four worker reads, avoiding an unbounded catch-up loop.
  Missed output during a stalled main thread cannot be recovered retroactively.
- Native `resume()` is abortable by playback retirement, so a pending permission
  promise cannot revive paused audio or keep its buffering lease alive.

## Matched native cohort

A frozen before/after harness uses the actual production transport, playback
adapter, mixer worker and Mediabunny decoder. Forty sequential one-second PCM16
WAV originals have distinct durable IDs, with a 250 ms tone at each clip's start.
An original 64×64 AVC video is decoded and painted with the real sequential video
cursor. Original reads use real IndexedDB transactions. No original-read delay or
codec timing is simulated.

The browser creates a fresh page, IDB project, AudioContext and worker for each
sample. Fixture encoding, IDB population, worklet installation and the initial
paused video frame precede the measured Play. Five pairs alternate before/after
order. A native AudioWorklet witnesses the **first nonzero sample actually rendered
in the audio graph**, independently of main-thread delivery of its message.

| Observation across five samples                              |         Before |    After |
| ------------------------------------------------------------ | -------------: | -------: |
| Play handler → first native-graph energy, AudioContext clock |       138.7 ms | 106.0 ms |
| Play handler → main-thread delivery of that worklet message  |       140.2 ms |  99.1 ms |
| Mixer worker initialization                                  |       122.4 ms |  58.4 ms |
| Original reads before first sound                            |             42 |        2 |
| Presentation time at first buffer, range                     | 113.3–163.9 ms |     0 ms |
| Scheduled native nodes, peak                                 |              3 |        3 |
| Errors / remaining nodes after close                         |          0 / 0 |    0 / 0 |

The graph-clock median falls 23.5%, message-delivery median 29.3% and worker setup
52.3%. These are different boundaries, not additive gains. The two required
originals are the current video and current audio cue. Every AFTER sample begins
at sample zero with no skipped buffer offset, preserving the attack; the video
clock remains at zero during preparation.

Raw graph-clock samples are **74.0, 128.0, 170.0, 160.0, 138.7 ms** before and
**106.0, 159.4, 95.4, 106.0, 95.4 ms** after. Thus the improvement is a cohort
median, not a per-run or universal latency guarantee. The separate minimal graph
with already prepared PCM records 10.0 ms on its native clock and 15.6 ms message
delivery; its timing is not subtracted from application samples. That calibration
has no decoder or IndexedDB workload.

Environment: Linux, Chromium 156.0.8078.4, 800×600, DPR 1, one foreground page, one driver and
one active mixer worker, nice 15, enforced total 100% CPU quota, 2,000 MiB memory high /
2,400 MiB maximum and no swap on a shared workstation. This witness decodes native
video and paints its frame; it does not measure GPU composition throughput. Its
startup context/worklet is precreated, while the application creates its context
within the Play gesture. AudioContext clocks and worklet messages do not certify
physical speaker output or display timestamps. Actual device/browser output
latency, native resume, asset formats and UI workload still matter.

## Verification and reproduction

Focused regressions cover buffering cancellation/ownership, reverse phase,
slow first PCM, long-frame backlog, lazy originals, silence discovery, PCM-cache
bounds/eviction and cleanup. The native startup test verifies real graph energy,
the preserved first attack, only two original reads before output, unchanged
canonical data and zero remaining native nodes/video-frame reservations.

The full editor check imports and plays a real standalone WAV, exercises live
volume/undo and native sound-bank preview. The existing WebGPU export check
encodes and independently decodes original video plus timed audio, asserting
frame colors/timestamps, audio RMS windows, cancellation and native cleanup.
These are functional checks, separate from the timing cohort.

Frozen source trees, compiled JavaScript/maps, exact harness and drivers, raw
clock/PCM-request/IDB/video observations and cleanup records are retained under
ignored `artifacts/motion/perf/audio-start/`. The initial browser harness command
used an unsupported Bun external-map/outfile combination; that setup failure and
its trace are preserved separately, followed by the corrected passing command.

The implementation follows WebAudio's explicit native-clock scheduling and
Mediabunny's bounded media-sink interface. References:
[Web Audio scheduled sources](https://www.w3.org/TR/webaudio-1.0/#AudioScheduledSourceNode),
[Mediabunny AudioSampleSink](https://mediabunny.dev/api/AudioSampleSink).
