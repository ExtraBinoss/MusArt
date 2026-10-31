# Effect, adjustment and color opening audit — 2026-10-30

## Supplied Chrome traces and shared menu correction — 2026-10-31

The user's `Trace-20261031T003622.json` records four right-click openings
lasting 135.3–327.3 ms inside the native contextmenu dispatch. Every following
right-button pointerup dispatches a synthetic `click` from Radix MenuItem's
pointer-release handler, followed by `menu.itemSelect`; those nested clicks take
107.1–299.7 ms. The item received no pointerdown because it mounted beneath the
held right button. This is a second activation caused by the menu implementation,
not another physical primary click. The initial centre-of-label witness missed
it because its release landed on a menu separator.

All shared context/dropdown root and submenu content now capture pointerup and
reject secondary-button activation before Radix's item handler can synthesize a
click. The same guard protects Select options. Primary drag-release selection,
keyboard activation, consumer capture callbacks and genuine Radix focus/portals
remain covered. The native Morph witness explicitly holds the right button,
moves over Duplicate and releases it there: the menu must remain open, the
revision and layer count must stay unchanged, and a later deliberate duplicate
must produce exactly one transaction with exact undo. The pre-correction frozen
build fails that retained-menu assertion; its failure is archived.

The user's `Trace-20261031T004013.json` independently records 183.7–259.7 ms
pointerdown handlers when opening the Add menu. The trace includes the modal
MenuRootContent, global page locking and synchronous style/position/focus work;
React DevTools 8 also measures unchanged Suspense host geometry in this session.
Its `measureHostInstance` calls appear directly in native layout stacks. These
are observed costs, not evidence that App or every editor surface rerendered.

Editor context menus and dropdowns now default to `modal={false}` in the shared
primitives, with an explicit modal override retained. They no longer set inherited
body pointer blocking or add ordinary-menu scroll locks. Actual dialogs preserve
their own modal behavior. Shared integration regressions verify background
pointer styles, overflow and accessibility, in addition to native dismissal and
focus behavior. AGENTS.md records the lasting rule: local menus must keep
invalidation local; zero React commits alone do not establish responsiveness.

A separate Chrome 154.0.8037.97 development diagnostic on the actual Morph project
records the following first-useful-RAF observations. Both use 1600×1000 at DPR 1,
one foreground native browser, CPUQuota 200%, MemoryHigh 1800 MiB / MemoryMax
2600 MiB and zero scope swap on a shared Linux workstation. No extension was
loaded in this controlled browser. The scope bounds observed renderer/GPU work;
Chrome may register its main process in a separate desktop scope.

| Add menu sample                  | Earlier modal default | Nonmodal default |
| -------------------------------- | --------------------: | ---------------: |
| First root opening               |              253.1 ms |         124.1 ms |
| Root reopening                   |              156.9 ms |         204.4 ms |
| Effect submenu, two openings     |        23.3 / 15.2 ms |   25.9 / 51.9 ms |
| Adjustment submenu, two openings |        41.1 / 38.7 ms |   20.3 / 55.8 ms |

The first root observation improves, but these two samples do **not** establish a
repeatable warm speedup or instantaneous development interaction. The reports
retain that regression rather than treating the nonmodal default as a complete
latency solution. Native production behavior and uninstrumented timing remain
separate from React development/profiling overhead.

The accompanying subscription audit removes selection-only invalidation from the
simple desktop/mobile timelines, artboard mode footer, timelapse panel and layer
animation controls. Advanced timelines still follow canonical layer selection;
Inspector and selected-content export retain their necessary live subscriptions.
A shared cached document selector handles edits, page changes, loads and cleanup.
Deleted animation owners retire before geometry lookup, avoiding a stale
Inspector crash after duplicate/undo.

The maintained native witness is
[`layer-menu-responsiveness.spec.ts`](../../test/browser/layer-menu-responsiveness.spec.ts).
It records generated/dispatch/presentation clocks and actual React counters,
checks held secondary release, repeated opening, one duplicate transaction and
undo, the actual Morph effect popover, Add/effect/adjustment menus, page errors
and production pixel-readback APIs. The source traces, frozen before bundle,
matching maps, diagnostic runs and failures are retained under
`artifacts/user-right-click-20261031/` and `artifacts/layer-overlay-investigation/`.

An unrelated concurrent TanStack Start routing migration replaced the application
entry while this investigation was running. The standard final build reached
prerendering and failed on `/` with an internal server error. A separate ignored
verification entry mounts the same current Studio/editor source and public assets
without that routing/prerender stage, retains StrictMode and the normal renderer
adapter, and explicitly includes all application UI utility classes. That bundle
can verify this UI change; it is not a passing full routing/release build.

The final isolated native witness passes in 15.1 seconds (17.0 seconds including
runner work), using Chrome 154.0.8037.97, native Intel Xe-LPG WebGPU, 1600×1000
and DPR 1. Dispatch → first useful RAF / second presentation opportunity are
113.2 / 123.4 ms for cold Morph context selection, 33.3 / 44.2 ms for selected
reopening, 82.4 / 98.4 ms for the Morph effect popover and 55.5 / 69.0 ms for
the Add root. All six actual React counters stay unchanged in these samples;
page errors and instrumented production pixel reads remain zero. These are
individual observations on the isolated UI bundle, not paired speedup estimates
against the supplied instrumented development session. The two native French and
English catalogue regressions also pass, including category filtering, actual
effect/adjustment insertion and exact undo.

An earlier native diagnostic retained Playwright tracing and repeatedly returned
the multi-megabyte Morph document as a nested protocol object. It exceeded the
45-second test budget while checking exact undo. A focused CPU profile identified
structured cloning, protocol serialization, GC and background journal work in
that interval. The final witness preserves the same project, gestures, duplicate,
undo and exact document checks, but returns canonical JSON strings for whole
document equality and records timings without Playwright tracing. No timeout,
interaction or assertion was removed to obtain the passing result.

## Earlier effect and adjustment cohort

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
