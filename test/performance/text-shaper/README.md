# Native text preparation comparison

This opt-in scenario requires an immutable production build with the shared
measurement transform. It is deliberately outside the ordinary browser gate;
normal application builds have no preparation marks. See
[the measured report](../../../docs/performance/text-shaping-browser.md) and
[the isolation protocol](../../../docs/performance/protocol.md).

`fixture.ts` creates 150 real editable text layers, grouped fifteen per bundled
family across ten fonts. The serialized fixture SHA-256 is
`072ff7c5fe9f4f5b1852d2cf7cfcfe6a9c173385d5f55e61b38aa8908c940ad0`.
Keep the fixture, browser flags, viewport, DPR, density policy and application
UI identical between methods. Font coverage and shaping fingerprints must pass
before measuring a candidate; a rendered missing-glyph box is not a valid
benchmark.

Create detached old/new worktrees at the source revisions being compared.
Install frozen dependencies independently in each. Workspace links must resolve
to each worktree's own core/render/assets sources, never another mutable tree.
For a patched dependency, commit and install the same Bun patch used in the
application; record the exact installed bundle hash. Font bytes and package
versions must also match the recorded workload.

For each worktree, create an ignored Vite configuration that merges its ordinary
configuration with this plugin and an independent absolute output directory:

```ts
import { defineConfig, mergeConfig } from "vite";
import base from "/absolute/old-worktree/vite.config.ts";
import { textPreparationTiming } from "/absolute/repo/test/performance/text-shaper/instrumentation.ts";
export default defineConfig(
  mergeConfig(base, {
    plugins: [textPreparationTiming()],
    build: { outDir: "/absolute/repo/artifacts/text-old/dist", sourcemap: true },
  }),
);
```

Build once, retain the compiled JavaScript and maps, and preview on an unused
strict port. Confirm HTTP 200 before launching the browser. Save the source SHA,
any working-tree/source patch, configuration/plugin/harness copies and hashes.
The plugin uses the declared exact MagicString development dependency to preserve
source mappings. The historical measured plugin copy resolves that same pinned
version through Vitest; its insertion boundaries are identical.

Create a separate ignored Playwright configuration with an absolute `testDir`
pointing here, `webServer: undefined`, one worker, and the ordinary browser flags
and 1600×1000 viewport. Set its baseURL to the immutable preview. Set
`use.trace: "off"` so trace snapshots cannot interfere with measured frames.

Launch three **separate** processes per method; `--repeat-each=3` in a shared
browser process is not this protocol. Change the run number/output directory
for each process, keeping the command and bounds unchanged:

```sh
systemd-run --user --scope --quiet \
  -p CPUQuota=100% -p MemoryHigh=1800M -p MemoryMax=2200M -p MemorySwapMax=0 \
  nice -n 15 ionice -c 2 -n 7 env NODE_OPTIONS=--max-old-space-size=1536 \
  MUSART_TEXT_OUTPUT=artifacts/text-old/browser-1 \
  MUSART_TEXT_URL=http://127.0.0.1:6208 \
  MUSART_TEXT_SHA=actual-frozen-source-sha \
  MUSART_TEXT_METHOD=harfbuzz-opentype MUSART_TEXT_RUN=1 \
  ./node_modules/.bin/playwright test profile.spec.ts \
  --config artifacts/text-old/playwright.config.ts --workers=1
```

The scenario clears/disables browser network caches, records actual adapter
metadata, GPU submissions/cache counters, five React counters, real read APIs,
UserTiming preparation intervals and resource payloads. It checks the first
canonical drawn revision and two RAF opportunities, settles background
thumbnails outside the cold interval, exports/decodes PNG, then measures a real
fifteen-layer text edit without flushing that edit's work away. Snapshot and
decoded-pixel validation occur after the measured intervals. One undo must
restore the actual document.

Preparation marks include background renderer instances and overlapping async
work. Preserve raw totals and all observations; never add nested interval sums
as an exclusive CPU decomposition or call canonical/RAF proxies GPU durations.
The fixture groups families to avoid artificial font-LRU churn; the warm edit
uses a recently retained face. It is not a continuous-weight animation benchmark.
Three observations on a shared host do not establish universal speedups.

Stop once a setup failure is understood, retain its report/trace/screenshot and
fix the actual cause. Do not raise timeouts, omit the cold sample or select only
favorable observations. Keep application failures distinct from instrumentation
failures and unavailable rendering backends.
