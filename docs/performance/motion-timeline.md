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
