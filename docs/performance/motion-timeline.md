# Motion timeline interaction profiling

## User-provided Chrome trace

`Trace-20261030T115129.json` records the development editor at `localhost:6110`,
with DPR 1.25. Its selected interval is 9,350.998 ms and includes 49 wheel events,
30 scroll events and two clicks. The original remains unchanged. Its fingerprint,
thread association, raw events and sampled call stacks are retained under the
ignored `artifacts/motion/perf/user-trace-115129/` directory.

| Main-thread observation                        | Recorded value |
| ---------------------------------------------- | -------------: |
| Tasks lasting at least 50 ms                   |             18 |
| Time occupied by those tasks                   |   4,740.661 ms |
| Longest task associated with virtual scrolling |       566.9 ms |
| Script self time                               |   5,148.308 ms |
| Paint/prepaint/commit self time                |     488.674 ms |
| Style self time                                |     155.933 ms |
| Garbage collection self time                   |     140.062 ms |
| Layout self time                               |      47.086 ms |

Self categories are disjoint; nested layout and garbage collection are removed
from their enclosing script intervals. CPU sample counts identify call stacks
and are not converted into milliseconds. The 666.660 ms maximum task precedes
the first input and samples Three's internal animation callback, so it is not
attributed to scrolling. This trace does not identify the GPU adapter or establish
a production frame budget.

## Confirmed scroll causes

The virtual-window state belonged to `TimelinePanel`. Window changes reran its
header, including the closed `AudioLibrary`, as well as admitting new track rows.
Long tasks of 202.6, 566.9, 564.0, 511.7, 435.1 and 377.2 ms include these exact
application stacks shortly after scroll dispatch. The library eagerly constructed
its catalog JSX even though Radix subsequently omitted the closed DOM.

The previous generic window also advanced at every 24-pixel row boundary and read
`clientHeight` from each scroll callback. The correction gives the row body sole
ownership of the window, admits bounded blocks of rows through a pure constant-time
planner, caches viewport height through ResizeObserver and listens passively to
native scrolling. A callback ref supports late-mounted portal viewports. Library
controls are constructed inside Radix's actual content lifetime, preserving its
entrance and exit animations.

The planner covers fractional rows, large jumps, resize, filtering, empty lists
and the composition's last visible row. It retains a bounded overscan window;
work does not grow with the total number of rows.

## Separate click costs

The first pointer-down takes 192.062 ms, followed by a 257.1 ms task in Layers and
Inspector presentation (`LayerRowContents`, `EffectPopover` and Tooltip). The
second pointer-down takes 201.565 ms and includes timeline selection presentation.
These are separate from the scroll-window costs and require their own verification.

React 19 development debug tasks amplify repeated React/Radix construction in this
capture. Their nested durations and asynchronous component-track starts/ends are
not added together or counted as new DOM mounts. The observed application work
remains a real optimization target.

## Verification status

Sixty distinct focused cases cover the planner, viewport lifetime, row boundaries,
selection identity, popup ownership and real-gesture duration feedback. Scoped
TypeScript, ESLint and typed Oxlint pass. The frozen `sound-body-fixed` production
build has matching source archives and maps.

The production comparison uses Chromium 156, the recorded Intel Xe LPG WebGPU
adapter, 1440×1000, DPR 1, one worker and low priority. Browser and server each
receive a 50% CPU quota, with bounded memory and no swap. These are different
conditions from the user's development trace.

| Same production interaction                     | Prior correction | Body-local window |
| ----------------------------------------------- | ---------------: | ----------------: |
| Twenty visual-scroll wheel packets, script time |       1,489.2 ms |          947.1 ms |
| Visual-scroll long tasks                        |               24 |                16 |
| Timeline panel renders during visual scrolling  |   Window updates |                 0 |
| Twelve audio-scroll wheel packets, script time  |         273.5 ms |          112.8 ms |
| Audio-scroll long tasks                         |                8 |                 3 |
| Fade editor opening, script time                |          50.8 ms |           12.4 ms |

Visual-scroll script time falls another 36.4%, or 66.4% against the initial
2,818.2 ms baseline. Audio-scroll script time falls another 58.8%. The five editor
root counters stay unchanged, and the completed phases report no application
errors or instrumented production pixel reads. Actual scrolling and replacement
of out-of-window rows are verified; the zero panel count does not mean the list
stopped updating.

This is still not a completed 16 ms frame-budget gate. Visual RAF-gap p95 remains
100 ms under this quota; the same native HTML control has an 83.4 ms RAF-gap p95
and approximately 501 ms input-dispatch p95. New row admission, Radix work and
garbage collection remain in the samples. An additional cold-click/trim driver
probe incorrectly counted pre-existing/exiting hover tooltips and failed before
the trim; that probe is preserved and excluded from functional success claims.
Its failure does not replace the independent completed phase measurements.

Follow [the reproducible protocol](protocol.md) for source maps, resource limits,
readback probes, actual React commit counters and preservation of failures.

## Second user trace: visible gaps during scroll

`Trace-20261030T133413.json` records Sound Playground in the development editor at
`http://localhost:6110/`, DPR 1.25. Frame metadata identifies renderer PID 960557,
main thread 1, CPU profile `0x2`; profile chunks arrive on collector thread 82.
The selected window is 16,999.067 ms and the full main-thread span is 17,005.417 ms.
It contains 50 wheel events, 91 scroll events and no clicks. The original remains
unchanged; SHA-256, raw events, call stacks and screenshot offsets are retained in
`artifacts/motion/perf/user-trace-133413/`.

| Main-thread observation               | Recorded value |
| ------------------------------------- | -------------: |
| Tasks lasting at least 50 ms          |             27 |
| Time occupied by those tasks          |   9,906.014 ms |
| Longest task                          |   1,346.783 ms |
| Script self occupation                |  10,310.020 ms |
| Paint/prepaint/commit self occupation |   1,161.873 ms |
| Style self occupation                 |     204.618 ms |
| Layout self occupation                |      55.720 ms |
| Garbage collection self occupation    |     147.954 ms |

These categories are disjoint. Renderer-main paint work is not GPU execution time.
Sample counts identify stacks and are not converted into component milliseconds.
The initial 833.223 ms task samples Three's internal animation callback before
the input sequence; it is excluded from timeline-row attribution.

The screenshot at +10,703.636 ms shows an empty timeline body with the header
still visible. It falls inside a 1,346.783 ms task starting at +10,533.286 ms,
7.058 ms after a scroll event. Its sampled application ancestors include
`TrackDurationTooltip`, `TimelineIconButton`, `TooltipContent`, `TrackClips` and
`TimelineRowView`. Audio rows are visible again at +11,916.902 ms. Another empty
body appears at +13,073.367 ms, within a 659.663 ms task containing
`TimelineRowView`, `KeyframeMarker` and `TrackClips`. Sparse screenshots establish
visible gaps, not their continuous duration.

The prior header-level `AudioLibrary` hotspot is absent from the dominant stacks.
New row admission still constructs React, SVG and Radix control trees, amplified
by React 19 development debug tasks. Native scrolling can advance while this
main-thread work delays the next virtual window. Memoizing retained rows alone
does not remove the admission cost.

The approved migration draws the dense temporal body in one bounded, retained
Canvas2D viewport. Indexed ranges supply visible clips, keys and interpolation
segments; HTML labels and a small active DOM overlay retain accessible controls,
menus and editors. This follows the relevant Beam architecture, which also keeps
transparent DOM interaction buttons. It preserves the existing composition GPU
renderer and typed gesture, preview, cancellation and undo paths.

Canvas targets the measured visual subtree cost; window publication, validation,
media work and main-thread blocking still require bounded scheduling. It cannot
repaint while that thread is blocked. The migration's browser witnesses live in
`test/browser/motion-canvas.spec.ts`: first-frame viewport coverage, bounded backing
allocation, optical row coverage from native screenshots, hit testing, live
gesture commits, active editors, static-body retention during Play, React counters
and instrumented production readbacks. At preparation time these new cases are
not executed; the trace establishes the problem, not a post-migration speed claim.

## Canvas production scroll cohort

The migration's frozen build 5 (`canvas-body-handoff`) was compared with one new
DOM reference from `sound-bank-fixed`. Both open the real Sound Playground from
the gallery: 23 layers, 23 visual occurrences, 70 keys, nine audio tracks and six
seconds at 30 fps. The template bytes and SHA-256 match. The browser is Chromium
156.0.8078.4 on the recorded Intel Xe LPG WebGPU adapter, 1440 × 1000, DPR 1.

| Same application workload                |  DOM reference | Canvas build 5 |
| ---------------------------------------- | -------------: | -------------: |
| Twenty visual wheel packets, script time |     411.666 ms |     234.919 ms |
| Visual long tasks                        |              8 |              2 |
| Visual RAF-gap p95                       |        66.7 ms |        50.0 ms |
| Twelve audio wheel packets, script time  |     131.168 ms |      34.262 ms |
| Audio long tasks                         |              1 |              1 |
| Audio RAF-gap p95 / maximum              | 50.0 / 50.0 ms | 33.4 / 83.3 ms |
| Audio driver phase wall time             |       845.3 ms |       845.7 ms |

Script time falls 42.9% for visual scroll and 73.9% for audio scroll in this single
pair. The five editor root counters and timeline-panel counter remain unchanged.
Local React commits remain (23 → 20 visual, 9 → 8 audio) because HTML labels are
still admitted. Retained labels do not rerender. The former per-key marker,
tooltip and menu trees are absent from the dominant sampled stacks. Remaining
samples include label React/i18next work, Canvas projection/frame queue and the
panel's scroll handler; this capture does not identify another single large
application hotspot suitable for a broad rewrite.

The retained bitmap is 1196 × 283, or 1,353,872 bytes, independent of the document
extent. It records 20 visual paints and 22 audio paints; audio retains nine prepared
waveform references. Application errors and instrumented production WebGPU,
WebGL, Canvas2D and VideoFrame readbacks are zero, with all four hooks present.

The comparison requests browser/driver 50%, preview 45% and dev6110 5%, totaling
one CPU, with 1,800 MiB, no swap, nice 19 and a 55-second browser-unit limit.
Preview/dev quotas are read back in both runs; the browser quota is read back in
AFTER and retained only as the exact 50% launch command in BEFORE. No dev server
was stopped or frozen. Quotas were verified restored to 100%. The BEFORE wrapper
expired after its completed capture because of `RemainAfterExit`; cleanup ran,
and the corrected AFTER wrapper exits zero. This qualification is preserved
rather than presenting both outer commands as passing checks.

The same-browser native HTML control has RAF-gap p95 66.7 ms in both runs, with
dispatch p95 297.8 → 400.4 ms. Application audio dispatch p95 remains approximately
82.5 ms despite its lower script cost. These are separate input producers and
cannot be subtracted causally. RAF callbacks are presentation opportunities, not
physical display timestamps. There is no general 16 ms guarantee; the audio
maximum frame gap is worse in AFTER. Older Body results use different or
incompletely recorded limits and are excluded from these percentage calculations.

Raw profiles, mapped stacks, exact drivers, compiled JavaScript/maps, hashes,
native PNGs, control clocks and resource records are retained under
`artifacts/motion/perf/sound-canvas-before/` and `sound-canvas-after/`. This cohort
measures scroll; later direct-icon and popover verification is a separate build
and interaction workload.

## Separate build 6 interaction cohort

One additional capture of `canvas-body-final-ui` measures actual pointer hover,
the playback menu and the corrected direct audio-fade button. It uses the same
browser, adapter, viewport and requested 50/45/5 CPU allocation as the new scroll
pair, with all quotas read back, bounded memory, no swap and a 55-second unit.
Both server quotas are verified restored after the successful command.

| Build 6 interaction             | Script time | Long tasks | RAF-gap p95 |
| ------------------------------- | ----------: | ---------: | ----------: |
| Header / label hover            |   74.990 ms |          1 |     50.0 ms |
| Playback menu                   |   82.187 ms |          1 |     66.7 ms |
| Eight clip / key hover swaps    |  176.042 ms |          2 |     50.0 ms |
| Eight audio-clip hover points   |   33.213 ms |          0 |     16.7 ms |
| Direct fade button opens editor |   87.423 ms |          2 |     66.6 ms |
| Fade draft                      |    3.813 ms |          0 |     16.7 ms |
| Fade close                      |    6.335 ms |          0 |     16.7 ms |

The five editor component counters and the panel counter remain unchanged in
all phases. Local child React work still commits. Every observed clip/key point
creates exactly one matching active DOM target; coordinates come from labels,
authored times and viewport geometry gathered outside profiling. The direct fade
icon opens the real editor. Draft and dismissal preserve the exact project and
revision (1 → 1). Errors and all four instrumented production readbacks are zero.

The swap profile identifies synchronous DOM admission in `overlay.tsx`: normal
hover also calls `flushSync`, and sampled stacks include synchronous React work.
Deferring only hover admission is a targeted future candidate, but it requires a
committed-target guard so that cold pointer-down still reaches the correct control.
Fade opening samples commit/layout, Radix sizing and native focus, with 62.687 ms
of style recalculation. The automated role-query/actionability boundary is retained;
these phase times are not labelled pure application opening latency.

The native HTML control in this capture has RAF-gap p95 83.3 ms and dispatch p95
499.6 ms. Its different producer and CPU-capped environment prevent a causal
per-event subtraction or universal 16 ms claim. These build 6 measurements have
no historical baseline comparison. Raw evidence and the full qualifications are
in `artifacts/motion/perf/sound-canvas-details/report.md`.

## Final Canvas hover admission — build 7

The follow-up targets the sampled synchronous admission in `overlay.publish`.
Canvas hover and the artwork hover lease update immediately. Ordinary clip/key/
easing controllers are admitted after 64 ms on the same semantic target, or
synchronously for pointer, context-menu and keyboard intentions. Audio commands,
trims and gap affordances remain immediate. Cancellation retires the timer;
stationary dwell re-hits the latest pointer before creating a controller.

The final production capture repeats eight real Sound Playground clip/key points
with the same requested 32 ms waits, Chrome 156 / Intel Xe LPG WebGPU, DPR 1 and
recorded 50/45/5 CPU caps, 1,800 MiB, no swap and nice 19. All eight post-paint
hover identities match. It records **50.242 ms script, zero local React commits,
zero long tasks and a 16.8 ms RAF-gap p95** (p50 16.7, maximum 33.4 ms). The five
editor roots, panel and retained labels are unchanged; Canvas paints advance
2→10 and no semantic target is admitted during the traversal. Application errors
and all four instrumented production pixel read counters remain zero.

The earlier build 6 diagnostic recorded 176.042 ms script, 18 local commits, two
long tasks and RAF-gap p95 50 ms. Its cleanup is inside that phase; the follow-up
moves away and waits 64 ms outside the measured phase. This boundary difference
and the actual input clocks are retained rather than reporting a strict causal
percentage from the total. After cleanup, the Canvas hover is empty and no DOM
target remains. The authored document stays unchanged. This supports the specific
rapid-hover path, not universal 16 ms presentation or faster cold popover setup.

The successful command, exact driver, compiled JavaScript/maps, hashes, CPU profile,
point observations, native PNG, control and restored limits remain in ignored
`artifacts/motion/perf/sound-canvas-hover-post/`. The three key/clip/menu and two
audio/drop native scenarios affected by this change pass in 22.5 s and 18.2 s.

## Zoom and aggressive movement follow-up

A separate matched production capture of Sound Playground found 528 redundant
retained-label renders during wheel zoom and 288 during slider zoom. Isolating
the HTML gutter's temporal dependencies removes both. The matched first fix
records wheel script **482.190 → 95.535 ms** and long tasks **9 → 0**; slider
script is **362.654 → 298.655 ms**, still with five long tasks. Horizontal script
is 39.894 → 31.041 ms. Protected editor roots, authored revision and actual
readback counters are unchanged. These measurements belong to the frozen
`zoom-scroll-fixed` executable, not every later interaction fix below.

The anchor/playhead clipping box had enlarged native scrollWidth even when the
composition fitted. Native and painted offsets are now reconciled against the
real temporal extent; the matching small-scale observations have zero overflow.
Canvas publication is flushed after the parent applies the native zoom anchor.

The user's additional aggressive capture exercises six wheel extrema, 22
two-axis packets including ±3,000/±12,000 px, rapid reversal and clamp tails,
full-range slider motion and 12 genuine ruler scrubs. It exposed two late HTML
gutter admissions in 19 sampled Canvas paints. The timeline's bounded label leaf
now opts into synchronous native-scroll admission only when its window changes;
measurement/ResizeObserver work stays deferred. Overscan is unchanged. The
strengthened real-browser 1,000-row check verifies actual labels and Canvas in the
same first-scroll callback, including both axes.

The aggressive slider still sampled Floating UI observer installation from the
changing static tooltip subtree; that help is now retained across controlled
value updates. Captured ruler moves also avoid unrelated panel-resize hit testing.
The aggressive scrub genuinely renders Motion frames, with 393 GPU submissions;
it is not a static-timeline workload. No pixel readbacks occur. The subsequent
tooltip/admission/scrub changes have focused functional checks, not a new claimed
FPS comparison or universal 16 ms guarantee.

Both captures used Chrome 156 / Intel Xe LPG, DPR 1, one browser and effective
browser/preview/dev quotas 50/45/5%, no swap, nice 19 and a 55-second bound. Controls
differ: baseline/AFTER/aggressive delivered 33/32/60 of 60 HTML wheel packets and
RAF p95 66.7/16.7/16.7 ms. Cadence percentages cannot be attributed solely to the
fix. Raw profiles, source maps, inputs, screenshots, commands and restored limits
remain under `artifacts/motion/perf/sound-zoom-{baseline,after,abuse}/`.

Final interaction checks use the live 6110 development build and are functional,
not latency measurements. The 1,000-row first-frame and clip/trim/zero-marker
cases completed before their three-case batch hit its 55-second process budget
during the ruler case. That case was rerun alone and passed in 20.5 s. Captures and
the interrupted batch are retained; the timeout was not hidden or increased.

## October 30, 20:54 user trace and rapid-scroll follow-up

`Trace-20261030T205418.json` is a 15.066 s development capture at localhost:6100,
DPR 1. It contains 137 wheel and 139 scroll dispatches on renderer 1222275,
thread 1. Scroll dispatches occupy 3,150.0 ms in total; the longest lasts
723.771 ms. CPU chunks for the main-thread profile are emitted on a profiler
thread and were associated by profile ID, rather than discarded by thread ID.
The dominant application stack is `useVirtualList.scroll → publish → flushSync`
with React/Radix construction for admitted labels. The initial 854.2 ms task
includes 852.9 ms of profiler startup and is not attributed to scroll. React's
development task instrumentation and the React DevTools extension are present.
These trace costs are not production latency claims.

The fixes retain synchronous label admission, preserving same-frame labels and
canvas hit testing. Virtual label controls use named native-title shadcn buttons
without constructing Radix tooltip trees per row. The motion authoring editor is
constructed only on activation, capturing the same validated occurrence and
returning focus on close; the actual editor still uses Radix. The first attempt,
which removed only tooltip trees, did not improve overall script time and was
not accepted as the performance result.

Audio scroll holds previously retired an in-flight waveform worker, throwing away
its decoding progress. Passive timeline holds now let that one request finish,
while keeping new background admission paused. Explicit audition pauses and SFX
priority retain interruption. Canonically cached peaks can publish immediately
even during a held scroll, and a bounded two-row lookahead warms nearby originals.
The worker remains serial, caches remain bounded, stale results remain rejected,
and disposal retires the worker. Unit regressions verify one worker job across a
scroll hold, synchronous warm-cache delivery, lookahead and existing cleanup/error
paths. No numeric cold-audio decoding speedup is claimed.

A matched production comparison freezes the initial dirty source, including the
unrelated animations work already in progress, then overlays only this change's
owned files. Both builds retain compiled JavaScript and source maps. The workload
is 1,000 hidden rectangle layers with one occurrence each, in Keyframes view,
and 18 real native vertical wheel packets alternating ±600/±1,200/±3,000 px with
24 ms requested waits. It exercises virtual-window churn without adding a
thousand-artwork GPU workload. Bootstrap and setup are outside the measured
script interval.

| Single matched production pair   |     Before |      Final |
| -------------------------------- | ---------: | ---------: |
| ScriptDuration delta             | 501.479 ms | 233.023 ms |
| TaskDuration delta               | 873.832 ms | 685.412 ms |
| Observed RAF-gap p95             |    50.0 ms |    33.3 ms |
| Delivered wheel packets          |         18 |         18 |
| Native HTML control RAF-gap p95  |    16.7 ms |    16.8 ms |
| Native HTML control dispatch p95 |    33.4 ms |    33.3 ms |

Script time decreases 53.5% in this pair. This is Chromium 156.0.8078.4 on the
reported Intel Xe LPG WebGPU adapter, Linux, 1440 × 1000, DPR 1, nice 15,
without a CPU quota, on a shared workstation. It is one pair, not a universal FPS
guarantee. The broader observer window records a remaining 171 ms long task in
Final; this window also includes setup/adapter observation and is not identified
as a specific scroll callback. Native controls are separate cohorts and are not
subtracted causally. Frames denote browser opportunities, not display timestamps.
The unsuccessful tooltip-only run, setup failures, raw frame/dispatch arrays,
exact driver, snapshots, maps and PNGs remain under ignored
`artifacts/motion/perf/scroll-205418/`. Original-trace hash, streaming analysis and
main-thread event/sample evidence remain in `user-trace-205418/` alongside it.

Separately, reorder completion no longer reveals an unchanged offscreen Layers
selection. Timeline pointer focus uses `preventScroll`, and virtual scroll
surfaces disable native scroll anchoring so recycled rows cannot pull them to
an old position. Native regressions cover layer/timeline reorders at nonzero
scroll, canvas time dragging, and the lazy editor's real opening/focus behavior.

### Additional dense-audio pass

The follow-up removes the remaining closed volume-popover roots from admitted
audio labels, with real validated scope capture and focus restoration on opening
and closing. Canvas surfaces now own a native Path2D waveform-geometry cache:
at most 32 envelopes (64 native paths) / 32,768 envelope points, keyed by immutable peak identity,
source interval, scale, visible horizontal window and row height. Vertical row
position is applied as a translation, so scrolling does not rebuild the same
curves. Colors and opacity remain live; the existing direct path painter remains
the fallback without Path2D. Surface disposal releases all retained paths.

A separate frozen pair starts from the earlier visual/worker fix, loads the real
Sound Playground originals, then repeats its authored audio clips to 1,000 unique
track IDs. It warms genuine decoded peaks before the same 18 native wheel packets.
The same Chromium/Intel Xe LPG, viewport/DPR, nice level and unbounded shared-host
scheduling apply.

| Additional audio pair            |     Before |      After |
| -------------------------------- | ---------: | ---------: |
| ScriptDuration delta             | 311.943 ms | 159.777 ms |
| TaskDuration delta               | 611.145 ms | 469.861 ms |
| Observed RAF-gap p95             |    33.3 ms |    33.5 ms |
| Delivered wheel packets          |         18 |         18 |
| Native HTML control RAF-gap p95  |    16.7 ms |    16.7 ms |
| Native HTML control dispatch p95 |    32.6 ms |    32.9 ms |

This is 48.8% less script in this additional pair; the frame cadence does not
improve in this run. The broader long-task observer records 52 ms maximum before
and 103 ms after, so this result establishes reduced CPU work, not elimination of
every stall. The original three runs and their qualifiers remain available.
`audio-before-source.tar.gz`, `audio-before-dist/`, final `after-src/`, build logs,
`audio-{before,after}.json`, controls and screenshots preserve the executable and
raw observations. The native regression also opens the actual volume editor,
restores focus and inspects genuine painted envelopes after rapid reversal.

### Lazy indexes, sparse keys and horizontal bindings — third pass

The next pass targets remaining work in the temporal canvas:

- The canvas previously indexed every visual/property row on the first request.
  It now builds only consulted rows, with a 64-row LRU per immutable row revision.
  Property-only queries do not construct duplicate occurrence interval trees;
  explicit track queries retain their prior semantics.
- Key buckets advance across empty ranges, and easing neighbors are reconsidered
  at key boundaries rather than every eight pixels. An extra boundary bucket
  preserves the original inverse-arithmetic behavior for fractional scales and
  signed drafts. The ignored reference runner compares 2,000 seeded cases with
  the prior implementation, including selected/moved keys and marquee ranges.
- Hover-only paints retain projected geometry. A scroll hit test followed by a
  hover update no longer projects the same scene a second time before painting.
- Overlay scroll updates write only pose; viewport width is measured at layout/
  resize, removing a potentially layout-forcing read from each native callback.
- Native horizontal offsets no longer rerender the canvas React subtree via
  unused `left`/`width` props and a freshly allocated label callback. Scale,
  document/selection changes and interaction callbacks still update normally.

The same frozen-source method retains the preceding optimized build as baseline
and changes only the six owned presentation files. The production workload is
1,000 hidden visual layers with 20 X keyframes each, 120 seconds, Keyframes view,
and 18 native **horizontal** wheel packets with the same ±600/±1,200/±3,000 px
sequence and 24 ms requested waits. It uses Chromium 156.0.8078.4 / reported Intel
Xe LPG WebGPU, Linux, 1440 × 1000, DPR 1, nice 15 and no CPU quota on the shared
workstation. Setup and source publication precede the measured input phase.

| Third production pair          |     Before |      After |
| ------------------------------ | ---------: | ---------: |
| ScriptDuration delta           | 139.597 ms | 119.943 ms |
| TaskDuration delta             | 697.178 ms | 446.953 ms |
| RAF-gap p95                    |    16.8 ms |    16.8 ms |
| Delivered native wheel packets |         18 |         18 |
| Long tasks in observer window  |          0 |          0 |
| HTML control RAF-gap p95       |    16.8 ms |    16.8 ms |
| HTML control dispatch p95      |    32.9 ms |    32.8 ms |

This pair records 14.1% less script and 35.9% less task time, with unchanged frame
cadence. It is a distinct workload from the previous visual/audio pairs; the
percentages are not cumulative and do not establish a general FPS gain.

A separate Bun 1.4.2 CPU microbenchmark alternates five before/after samples. For
1,000 property rows with 512 keys each, preparing an index and consulting the
first 16 rows takes a median **11.784 → 0.592 ms**. The new path indexes 8,192 keys
instead of eagerly deriving entries for all 512,000. For 2,000 projections of a
20-key sparse property row into a 1,196 px window, median time is
**47.713 → 4.033 ms**. These isolate algorithm work; JIT/GC effects are visible in
the raw samples and they are not browser interaction measurements.

Exact source snapshots, builds/maps, native input/frame arrays, matching HTML
controls, PNGs, equivalence runner, CPU driver and raw samples are retained under
ignored `artifacts/motion/perf/scroll-third/`. Focused regressions cover cache
admission/eviction, fractional bucket boundaries, hover geometry reuse and
viewport-width read counts. Native checks cover same-frame two-axis scrolling,
zoom alignment and dense key selection.

### Cold waveform preparation and visible priority — fourth pass

The waveform controller now admits the current viewport's originals ahead of
its two-row lookahead. Previously, the leading offscreen rows could occupy the
serial queue before any cold visible envelope. A passive scroll still lets the
single active decode finish; the next admission follows the latest viewport,
without restarting useful work or enlarging the cache/queue.

The dedicated preparation worker no longer inserts `setTimeout(0)` after every
half-second decode window. Native decoding already awaits asynchronous reads;
these extra timer waits accumulated before publishing the complete envelope.
The original 500 ms windows, PCM limits, serial worker, 2,048 bins and cache
budgets remain unchanged. An abort following an awaited read is checked before
accumulation, and the source is closed through the existing `finally` path.

A frozen production harness loads both algorithms with the same actual
Mediabunny decoder and starts a fresh dedicated worker per invocation. Five pairs
alternate before/after order for each generated 30-second PCM16 WAV original.
Every envelope is compared exactly, including all bins, against its cohort's
first reference; all **20 runs** match. Both versions perform 60 serial reads.

| Worker preparation, median of five |   Before |    After | Reduction |
| ---------------------------------- | -------: | -------: | --------: |
| 48 kHz stereo, 30 s WAV            | 440.6 ms | 271.3 ms |     38.4% |
| 192 kHz mono, 30 s WAV             | 577.0 ms | 446.3 ms |     22.7% |

The boundary starts immediately before `prepareAudioPeaks` and ends after its
source disposal. It excludes worker module initialization, original creation,
transport, IndexedDB and UI publication; these are **not** end-to-end waveform
arrival or scroll/FPS measurements. Raw ranges remain visible: 352.6–489.4 vs
200.5–360.7 ms at 48 kHz, and 448.0–780.4 vs 380.3–589.8 ms at 192 kHz.

The environment is Linux / headless Chromium 156.0.8078.4, viewport 800×600,
DPR 1, one foreground page, one worker at a time, nice 15, an enforced 100% CPU
quota, 1,800 MiB memory high / 2,200 MiB maximum and no swap on the shared host.
This audio-only harness uses no artwork/GPU path. The production UI verification
uses the separately frozen full editor, real Sound Playground originals, rapid
backscroll, actual volume popup/focus and instrumented zero pixel readbacks.

An attempted 750 ms window variant failed exact native envelope comparison and
was rejected. Its source, mismatch and failed driver log remain preserved; none
of its timings are included above. Unit regressions cover visible-first admission
after viewport changes, unchanged fractional-PTS/bin coverage, disposal/errors
and cancellation after an awaited read. Sources, dependency snapshots, compiled
JavaScript/maps, genuine WAV originals, all peak arrays and exact drivers are in
ignored `artifacts/motion/perf/waveform-fourth/`.
