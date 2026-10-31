# Dialog presentation responsiveness

The 2026-10-31 investigation covers Preferences and static/Motion library details. Closing previously removed their entire dialog root immediately, bypassing Radix Presence and the exit animation. Preferences also published its visibility from ProjectDashboard; details selection changed the favorites provider owner. Both paths invoked the grid while opening/closing. These are distinct from document installation timings.

## Changes

- Modal visibility/selection subscribe at small Jotai leaves. The library, its favorites provider and card grid keep their current React inputs when a modal changes visibility. Mobile navigation subscribes to the same preference flag and still cancels swipes.
- Genuine Radix dialogs remain controlled through their closed state. Presence finishes the real fade, then releases the content and focus scope. Standalone Preferences reports dismissal after that lifecycle, and superseded/unmounted instances cannot dismiss a later screen. Focus returns to the actual opener.
- Shared dialog transitions animate opacity rather than scaling a large glass/backdrop surface. The first Preferences mount has one dialog transition; the requested blur reveal remains for subsequent settings-tab changes. Reduced motion disables both.
- Dialog entrance/exit participates in the shared UI-presentation coordinator. Optional Motion source preparation, compilation, GPU admission and frame requests yield to it. Waiting is cancellable, owns no fixed loading delay and releases its subscription on completion or disposal. Preview clocks freeze across presentation holds and manual pauses remain independent.

## Local diagnostics

A separate Chrome DevTools trace of the actual development dashboard recorded a 1,757 ms interaction: 5 ms input delay, 1,159 ms processing and 592 ms presentation delay. It includes tracing overhead and is **not** the baseline of the bounded comparison below.

The before/after diagnostic used a frozen worktree based on `e56b9ee` plus a recorded snapshot of the concurrently edited library cards, one native Chromium 156.0.8078.4 at 1440 × 900, Linux, Vite development mode, one browser worker, a one-core CPU quota for browser/server, 2.2–2.3 GiB limits and no swap. The GPU adapter was not identified. These are single local samples, not an SLA or a production INP cohort.

The table reports the largest observed animation-frame callback gap in each interaction window. Native pointer timestamps, CSS animation start/end events, exact source overrides and raw observations are retained in ignored `artifacts/overlays-before.json`, `overlays-after.json` and `source-freeze.json` in the isolated worktree.

| Interaction                         | Before: largest RAF gap | After: largest RAF gap |
| ----------------------------------- | ----------------------: | ---------------------: |
| First Preferences opening           |                333.3 ms |               149.9 ms |
| Preferences reopening               |                583.3 ms |                16.8 ms |
| Preferences closing, first / second |        283.2 / 483.3 ms |         16.8 / 16.8 ms |
| Static details opening / closing    |         16.8 / 116.6 ms |         16.7 / 16.8 ms |
| Motion details opening / closing    |         83.3 / 416.6 ms |         16.7 / 16.8 ms |

Test-only module probes count component **function executions**, not React commits. ProjectDashboard, LibraryBrowser and TemplateGallery each executed twice on every Preferences transition before the change and zero times afterward. Details no longer executes LibraryBrowser or TemplateGallery for selection/dismissal. Actual favorites changes still update the grid normally.

The earlier closing samples contain no content exit animation. Corrected samples retain distinct `dialog-surface-out` start/end events and visible intermediate-opacity frames before removal. The native regression records pointer-to-second-exit-RAF opportunities and verifies focus restoration, unchanged library executions, a real Motion canvas appearing after the entrance, genuine snapping controls and reduced motion. Callback/RAF observations are presentation opportunities, not physical display timestamps.

Cold modal setup still costs about 150 ms in this constrained development sample. Native modal focus/accessibility and body locking are preserved. Artwork single-click still waits for the existing 280 ms double-click decision; keyboard and explicit preview actions do not. Document loading, first GPU compilation and unrelated renderer throughput are separate workloads.
