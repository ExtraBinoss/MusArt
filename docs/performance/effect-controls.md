# Effect selector and attachment selection investigation

## Reproduction and ownership

The supplied October 29 Chrome recording (`Trace-20261029T210622.json`) contains
pointer-down handlers of approximately 509–775 ms when opening effect selectors.
It records the older `SelectPopperPosition` path; the server's current property
selector uses item-aligned placement. A fresh page must therefore be checked
before treating that recording as a measurement of the current executable.
The recording also includes React development and DevTools measurement work.
Those costs are real for that session, but do not isolate application rendering.

Portals retain their React ancestry. Expanded attachment rows previously handled
clicks captured from their portaled controls, and a layer row handled a context
menu from its effect editor. Row selection handlers now accept only targets in
their actual DOM subtree. Context-menu events from a portal also stop before
reaching the layer tree's Radix context-menu trigger. The editor's own pointer
and focus handlers remain responsible for its attachment target. Native tests
exercise both the avatar and expanded-row entry points and verify that a later
deliberate layer-row click still selects the layer normally.

## Profile, change, verification

A separate frozen production profile of an ASCII blend list attributes its main
style flush to `@radix-ui/react-presence`'s `getAnimationName`, while mounting the
selected option's indicator. Item-aligned positioning and the scroll buttons
also read geometry. The CPU profile is mapped to the matching bundle and source
map; the invalidation trace is diagnostic and increases measured latency.

A trial replaced the optional indicator's Presence measurement with a checkmark
derived from the controlled value. It did not establish an overall latency gain:
later geometry reads still need up-to-date styles. That trial was reverted.
The genuine shadcn/Radix indicator, listbox, item collection, selected state,
focus, typeahead, scrolling and keyboard behavior remain in use.

Actual menu openings also acquire a bounded 250 ms presentation lease so optional
thumbnail admission yields during the entrance. Closing, disabling and unmounting
release it; focusing a closed field does not acquire a lease. This scheduling
change alone did not eliminate the slow samples, so it is not presented as the
cause of a measured speedup. A separate trial of an opacity-only list animation
did not establish a repeatable improvement and was not retained.

The reset/color-control browser witness also exposed numeric effect fields whose
generic 34px rule overrode their virtual row's 30px height. A specific effect-row
rule now preserves the intended geometry and spacing. The existing native check
continues to require 30px; its assertion was not relaxed.

The native color witness then exposed a separate focus-ordering bug: clicking a
different color could blur and commit the preceding typed draft before the new
picker opened. The parameter list now closes the old color slot during React's
discrete pointer-down capture, before native focus/blur. A user-event unit test
fails before this change and passes afterward; the native witness requires the
original PNG, canonical effect and revision to remain unchanged on handoff.
PNG polling compares SHA-256 digests of the actual screenshot bytes, avoiding
the test runner's enormous Buffer-diff formatting on an intermediate frame.

## Catalogue witness

[`effect-catalog-controls.spec.ts`](../../test/browser/effect-catalog-controls.spec.ts)
uses real native controls for all 32 registered effects and all 316 registered
parameter fields. Generated cases expose conditional fields, including the
64-field custom Gradient, and visit every registered parameter select choice.
Each effect also exercises common opacity, blend and alpha-composition controls.
The witness checks canonical values, stable layer selection, numeric/color preview
cancellation, a single commit and exact undo, and zero outer-editor React commits
during the measured interactions. It instruments actual WebGPU, WebGL and
Canvas2D read APIs and waits for canonical renderer acknowledgments after edits.

The other focused browser witnesses cover nested menu keyboard/dismissal behavior,
viewport bounds, shared reset/color controls, live-phase handoff on both renderer
backends, and the 50-image/100-effect photographic workload with export and durable
recovery. These are separate checks; the catalogue does not independently inspect
the pixels produced by every possible parameter combination.

## Measurement conditions

Frozen builds and source maps, individual effect JSON reports, failure logs and
CPU/invalidation profiles are retained under ignored
`artifacts/select-selection-regression/` and `artifacts/effect-controls-catalog/`.
The native browser is Chrome 154.0.8037.97 on Linux, 1600 × 1000, DPR 1, with an
actual Intel Xe-LPG WebGPU adapter. Runs use one worker, low process/I/O priority,
a 400% CPU quota, memory-high 3000 MiB, memory-max 4000 MiB and no scope swap.
This is a shared workstation, not an otherwise idle laboratory machine.

The scope bounds the runner and the observed renderer/GPU processes. Inspection
of `/proc/<pid>/cgroup` found that Chrome's main process registers a separate
desktop scope with no CPU/memory cap. The stated scope settings therefore do not
establish a cap on the complete browser process tree. Preserve this distinction
when reproducing or comparing the cohorts.

Input queue delay and dispatch-to-two-useful-RAFs are recorded separately. A list
must be visible and contain focus before its useful frame is accepted. The latter
is a browser presentation opportunity, not INP, GPU duration or physical display
latency. Do not compare the supplied development/DevTools capture directly with
these production durations.

Before the controlled-checkmark change, all catalogue value/selection/undo checks
completed, but six effects exceeded the unchanged 150 ms interaction budget.
Across 479 measured control interactions, median was 27.4 ms, p95 124.2 ms and
maximum 172.9 ms; maximum per-effect popover opening was 154.5 ms. The archived
second cohort, with only the scheduling addition, still contains budget failures.
Retain both cohorts when assessing subsequent experiments.

The third, subsequently reverted checkmark cohort records median 26.8 ms,
p95 113.4 ms and maximum 178.0 ms, with a 157.2 ms maximum popover opening.
The scheduling-only second cohort records median 27.1 ms, p95 111.0 ms and
maximum 195.9 ms. These data do not establish a checkmark speedup.
All 383 effect-specific parameter samples are below 131 ms in both cohorts;
the slower lists are the shared blend/composition controls. The 150 ms maximum
target has **not** been achieved for every interaction.

Catalogue correctness runs always record the first opening and every timing,
including the explicit 150 ms diagnostic failures. An enforced timing run uses
`MUSART_EFFECT_CONTROL_BUDGET_MS=150` with the chosen native configuration.
The functional test does not silently treat this budget as achieved: its JSON
report includes `diagnosticBudget.exceeded`. The original strict failure logs
remain archived. A universal 150 ms maximum is not a portable correctness gate
for other machines, software adapters or instrumented development builds.

After the row-height correction and reversion of the checkmark trial, the complete
final catalogue traversal completed all 32 effect cases and all 316 fields.
Its 479 measured interactions record median 25.0 ms, p95 100.0 ms and maximum
159.3 ms; maximum popover opening is 149.3 ms. The 383 effect-specific parameter
samples record median 21.9 ms, p95 78.8 ms and maximum 128.0 ms. Three shared Blend
mode openings exceed the diagnostic target: Dither 155.1 ms, One-bit Dither
159.3 ms and Pink phosphor 154.4 ms. All four monitored editor counters stayed
unchanged and production readbacks remained zero. This cohort precedes the
subsequent color-handoff correctness fix and does not demonstrate that every
interaction is instantaneous.

The checked-in probe also validates the actual EditorScene counter, rejecting
missing counters instead of substituting zero. Its follow-up cases are recorded
separately from the four-surface timing cohort.

After the color-handoff fix, seven focused native production checks passed in
43.0 seconds: the Dither, One-bit Dither and Receipt parameter traversals with all
five real editor counters, the complete reset/color handoff witness, both portal
entry points and the Receipt keyboard/viewport/undo witness. The three parameter
traversals record maximum control samples of 91.4, 90.6 and 90.8 ms respectively.
This small follow-up is not a replacement for the complete catalogue's tail
latencies or proof that all future interactions stay below 150 ms.

The 50-image/100-effect photographic workload passed in 47.9 seconds on the third
cohort, including its decoded export and durable recovery checks. The Bun fixture
process requires `BASE_URL=/` when run outside Vite; the initial missing-base-URL
setup failure is retained separately. Both WebGPU and WebGL live-phase handoff
checks and both native portal-selection entry points also passed. This is a
functional/load result, not an additional latency speedup.

The October 30 [effect/adjustment/color opening audit](overlay-openings.md) records the current native timings and the shared dropdown presentation lease, separately from these earlier selector cohorts.
