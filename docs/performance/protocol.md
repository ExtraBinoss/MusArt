# Reproducible performance protocol

Use this page before running a timing cohort. Workload definitions and historical verified values live in [the detailed rendering protocol](../rendering/performance-protocol.md); this page describes how to obtain trustworthy evidence.

## Freeze the executable

Record the source commit, working-tree changes and exact test command. A commit ID alone is insufficient when the measured build contains uncommitted changes. Retain the compiled JavaScript and matching source maps, along with a reviewed source diff when needed for reproduction.

From the repository root, prepare a separate ignored build:

```sh
bun install --frozen-lockfile
mkdir -p artifacts
MUSART_BUILD_DIR=artifacts/performance-cohort-dist bunx vite build --sourcemap
MUSART_BUILD_DIR=artifacts/performance-cohort-dist bunx vite preview --host 127.0.0.1 --port 4175 --strictPort
```

`MUSART_BUILD_DIR` resolves relative to the repository root. TanStack Start writes matching `client/` and `server/` outputs there and uses the same configured directory while prerendering/previewing; do not override only Vite's CLI output directory. Keep the preview process alive in its own terminal/session. Confirm an actual HTTP response before launching Chromium; a successful build does not prove that the server is still listening.

```sh
curl --fail --silent http://127.0.0.1:4175/ > /dev/null
```

Create an ignored `artifacts/performance.config.ts` using the checked-in browser configuration:

```ts
import base from "../playwright.config";

export default {
  ...base,
  testDir: "../test/browser",
  outputDir: "./performance-browser",
  webServer: undefined,
  use: { ...base.use, baseURL: "http://127.0.0.1:4175" },
};
```

Run focused cases serially:

```sh
bunx playwright test test/browser/selection.spec.ts --config artifacts/performance.config.ts --workers=1
bunx playwright test test/browser/pan-presentation.spec.ts --config artifacts/performance.config.ts --workers=1
```

The default checked-in configuration may start its own build/server. The temporary configuration above avoids rebuilding under an active cohort. Development port 6100 is useful for functional reproduction, but HMR and development overhead make it unsuitable for final latency claims.

## Isolate the cohort

- On a shared workstation, run only one heavy build, typecheck, test or browser command at a time across the whole agent team. Focused development tests may use the configured bounded worker count; timing cohorts use one worker, low process/I/O priority and an enforced CPU/memory scope. Do not keep obsolete preview servers running. If memory or swap pressure appears, stop the batch before starting another check. An isolated process limit failure is a failed check, not permission to remove sources or weaken assertions.
- Reserve one native GPU slot. Stop other test workers, coverage, TypeScript, lint, builds and competing browser/GPU workloads before timing begins. Ask other agents to remain quiet until the run ends.
- Keep the measured tab foregrounded. Record browser version, OS, viewport, DPR, backend and actual adapter information. Launch flags alone do not establish whether the adapter is hardware or software.
- Separate application bootstrap, source decoding/compilation, first useful canvas frame, first cold selection and warm interactions. Do not preselect the first text or mount its font controls before measuring the cold click.
- Wait for the intended canonical frame and visible decoded thumbnails before warm samples. Report preparation separately instead of hiding it inside warmup.
- Also measure immediate input after a large committed edit while journal/accounting/autosave work is still pending. Do not flush or wait that workload away. A healthy steady-state pan and a fast canonical GPU acknowledgment do not establish that subsequent input stays responsive.
- For IndexedDB reloads, remove bootstrap workload flags that reconstruct a fixture. Verify a real persisted manifest/originals path rather than accepting only a matching deterministic project ID or layer count. See [Storage](storage.md).

On Linux with a user systemd manager, a bounded typecheck can run as follows. The
scope includes child processes, disables swapping for this check and caps total CPU
use to one logical core. Keep core dumps disabled for these disposable verification
processes. Record the scope limits in timing reports; capped and uncapped cohorts
are different environments.

```sh
ulimit -c 0
systemd-run --user --scope --quiet \
  -p CPUQuota=100% -p MemoryHigh=1800M -p MemoryMax=2200M -p MemorySwapMax=0 \
  nice -n 15 ionice -c 2 -n 7 env NODE_OPTIONS=--max-old-space-size=1536 \
  ./node_modules/.bin/tsc --noEmit
```

Use the same ownership rule for other heavy commands and pass `--maxWorkers=1` to Vitest for comparable timing cohorts or constrained machines. Normal feature iteration runs focused/related tests without coverage; optional related coverage goes to its separate partial-report directory. Full coverage and load cohorts belong to CI/release verification or a relevant investigation, not every local edit.
Choose a bounded browser budget before launching its single cohort, rather than
starting several browser processes alongside coverage or compiler workers. A
process heap limit must fit inside its scope with room for native allocations and
children; do not infer total memory consumption from the JavaScript heap limit.

## Name the measured boundary

| Metric                               | What it establishes                                                                                                        |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Driver operation wall time           | Browser transport/IPC plus work until that command returns                                                                 |
| `automation.load()` call duration    | Synchronous engine publication, not later GPU readiness or persistent saving                                               |
| Generated input timestamp → dispatch | Native/browser queueing, possibly including a coalesced packet's earlier timestamp                                         |
| Capture/dispatch → RAF               | Application handling and the next observed animation-frame opportunity                                                     |
| Second RAF after a useful state      | A browser presentation opportunity; not a certified physical display timestamp                                             |
| Canonical renderer acknowledgment    | The retained renderer drew the expected revision; inspect the actual presentation port and its error/supersession behavior |
| IndexedDB transaction completion     | The transaction committed, distinct from thumbnail generation and journal recovery                                         |

These proxies are not INP, GPU duration or physical end-to-end display latency. Preserve the generated and dispatch clocks rather than relabeling one as the other. Do not run a full-document automation snapshot in a measured RAF: cloning the document can dominate the very interaction being measured.

For native wheel tests, retain the full same-browser/context/viewport minimal-DOM control, actual delivered packet count, raw latency and `rawInput25msExceeded` flag. Wheel availability is checked with both the application capture budget and the incremental p95 distribution guard against that cohort's control; this is not causal per-event subtraction. Hand and frame-pacing limits remain separate. The exact contract and its rationale are in [the detailed pan protocol](../rendering/performance-protocol.md).

## Capture and attribute

- Install [the readback probe](../../test/browser/support/readback-probe.ts) before navigation. It instruments actual WebGPU buffer reads, WebGL pixel reads and Canvas2D pixel reads. Keep validation-canvas reads outside the production accounting interval.
- Record `.musart-app`, `.inspector`, `.canvas-area`, `.editor-canvas` and `.editor-gpu-scene` React counters before/during/after gestures. Record actual GPU submissions, source uploads, context/resource counts and pending work too.
- Preserve browser event timestamps with CDP `NavigationStart`/`Timestamp` and the exact CPU profile. Map samples only inside the relevant input window; a select/move/release/undo profile is not entirely a release profile.
- Use matching `.js.map` files for attribution. Save decoded exports and genuine canvas screenshots when checking rendering; a DOM mock or icon does not establish that pixels rendered correctly.
- Run Blink invalidation tracing separately when style/layout dominates:

```sh
MUSART_PAN_TRACE=1 bunx playwright test test/browser/pan-presentation.spec.ts --config artifacts/performance.config.ts --workers=1
```

The trace includes invalidation reasons and selector information. Its overhead changes timing, so compare it as diagnostic evidence and rerun non-tracing assertions afterward.

## Preserve failures

Copy fixed-name JSON reports, traces, screenshots, CPU profiles and exact build maps before another build/run overwrites them. Record the workload, source provenance, environment, command and result in the cohort directory. Do not raise timeouts, remove a first cold interaction, change the workload or weaken coverage to make a failure disappear. A skipped or unavailable backend must be reported as such rather than counted as GPU verification.
