# Effect, adjustment and color opening audit — 2026-10-30

The current production editor does not rebuild App, Inspector, CanvasArea, EditorCanvas or EditorScene when these menus open. The remaining opening cost is local UI mounting/style/layout and browser scheduling. A Chrome DevTools diagnostic attributes synchronous style work to Radix Presence's animation-name lookup and menu positioning. Its software-rendered, instrumented browser is separate from the uninstrumented native timing cohort; it establishes attribution, not a comparable duration or estimated saving.

## Shared scheduling correction

Popover content already acquired the bounded `UiPresentation` lease. Dropdown root/submenu content did not. They now use the same `withPresentationBoundary` helper, which keeps optional visible/canonical thumbnail GPU work out of the 250 ms entrance interval. The timer expires without rerendering children; closing/unmounting releases ownership. This does not interrupt already-submitted GPU work or add a render loop. Genuine shadcn/Radix portals, focus, item collections and animations remain intact. `asChild` retains the caller's original element and ref boundary, with no additional DOM wrapper.

This corrects a scheduling gap. The small timing cohort does not establish a large or repeatable overall speedup; adjustment tail latency actually increases in the second cohort. Color picker behavior and appearance are unchanged.

## Frozen native cohort

The baseline is `1c4689c`. Compiled production bundles and matching source maps are retained under ignored `artifacts/popover-audit/before-dist`; `before-src` records the baseline source. The initial baseline build used the then-clean tracked root at that commit. `after-src` overlays only the three owned production UI files onto that snapshot and builds `after-dist`, excluding concurrent Motion work. `before.json`, `after.json`, logs, screenshots and the exact driver are retained in the same folder.

Each cohort uses three fresh native Chromium contexts, one foreground tab, a 1600×1000 viewport at DPR 1, dark English UI and one selected rectangle with a custom three-color Gradient. Each page opens the root menu, Effect and Adjustment four times, then the effect's nested color picker four times: 12 samples per category, including all three first openings. The canvas and selected Inspector are ready before sampling; this is an editor-interaction audit, not application bootstrap or a 50-image load claim.

Native Chromium is 156.0.8078.4 on Linux, using WebGPU. Separate `environment.json` instrumentation captures adapters actually returned to the baseline and candidate renderer requests. The single-browser jobs use nice 15 and a configured systemd scope with CPUQuota 200%, MemoryHigh 2400M, MemoryMax 3000M and no scope swap; the desktop remains shared. Compare these results only within their stated environment.

The metric begins at native capture (`pointerdown` for the root, `click` for color). Hover uses the earliest relevant `pointerout`/`pointerover`: React can derive the new category's enter from the old category's pointerout, so starting only at pointerover misses work. It ends at the second RAF opportunity after the requested open surface has nonzero geometry/opacity. Input queue delay is stored separately. These values are not INP, isolated GPU duration, animation completion or physical display latency. With 12 samples, the listed p95 order statistic is also the observed maximum.

| Surface              | Before median / max | After median / max |
| -------------------- | ------------------: | -----------------: |
| Root Add menu        |     71.5 / 152.2 ms |    70.3 / 128.1 ms |
| Add effect           |      41.8 / 80.8 ms |     38.4 / 69.2 ms |
| Add adjustment       |      41.3 / 72.3 ms |     36.9 / 98.8 ms |
| Effect color palette |      45.1 / 73.2 ms |     43.0 / 52.2 ms |

All five monitored outer React counters stay unchanged in every measured opening. Actual GPU mapped reads, WebGL reads, Canvas2D pixel reads and VideoFrame copies remain zero, and the portable document is identical after browsing. No multi-second opening was reproduced in the completed cohorts. First openings remain slower and variable; this audit does not promise an instantaneous menu on every device/project.

## Verification and retained diagnostics

Focused unit checks cover the real Radix menus/popovers, bounded/expired leases, nested lifetime cleanup, `asChild`, category hover and localization. Native checks cover both French/English catalogue filtering and effect insertion/undo, photographic effect-color handoff/reset/cancellation, and real GPU hue/alpha preview with one commit, exact undo and unchanged editor counters.

An initial rapid-reopen timing attempt overlapped retired exit content and failed to observe a useful opening. A separate isolated native reopen witness passes on the baseline, so this is not reported as a confirmed product defect or a fixed bug. Those logs are retained. Earlier pointerover-only measurements and one probe variable-shadowing failure are also retained but excluded from the table. The completed driver waits for genuine close/unmount between ordinary openings; it never labels closing content as the newly requested menu.
