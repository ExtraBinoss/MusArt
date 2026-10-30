# CPU shaping and outline comparison

This opt-in Bun runner keeps the 16 measured cases across ten bundled families.
It is separate from the browser GPU scenario in the parent directory. It invokes
real shaping, variable outline extraction, curve conversion, wrapped layout and
fresh atlas packing/disposal. It never invokes a bitmap, SDF/MSDF or GPU API.

The candidate imports the current production adapters. The baseline imports the
actual old source and dependencies from an explicit, independently installed
worktree; HarfBuzz is **not** reintroduced into the application dependency graph.
Its Bun loader changes only Vite's `hb.wasm?url` import to a sentinel URL served
from pre-read local WASM bytes. Font bytes and WASM IO happen before timing.
Algorithm code is neither copied into the runner nor replaced by a simplified
shaper. A fresh process owns all module/native caches in each observation.

Prepare the original revision once, outside measurement:

```sh
git worktree add --detach /absolute/old-musart a40285b8f32f99778219cd9bcc55b8ae694c0edc
bun install --frozen-lockfile --cwd /absolute/old-musart
```

Keep its own dependencies, including HarfBuzz.js 0.4.15, OpenType.js 2.0.0 and
workspace links. Do not symlink its root `node_modules` to the candidate. Install
the candidate's exact lockfile and Bun patch independently. The measured
text-shaper 0.1.28 bundle SHA-256 is
`43746f6e9885b317347d700464786050c38577550eb1c092a3751bcde9547867`.
Run from the current repository root, serially, on an otherwise quiet host:

```sh
systemd-run --user --scope --quiet \
  -p CPUQuota=200% -p MemoryMax=2200M -p MemorySwapMax=0 \
  nice -n 15 ionice -c 2 -n 7 \
  bun test/performance/text-shaper/cpu/run.ts baseline 1 \
  artifacts/text-shaper-reproduction /absolute/old-musart
```

Launch two more **fresh processes**, changing `1` to `2` and `3`. Then use
`candidate` instead of `baseline` for three fresh candidate processes, with the
same caps, inputs, host and order. Each JSON contains the runtime/CPU, workload
hash, exact font hashes, all raw timings, glyph signatures, paths/bounds and
wrapped glyph placements. Missing non-whitespace glyphs abort the run rather
than silently benchmarking `.notdef` boxes.

The module clock includes loading backend modules. Bootstrap font parse/setup
are recorded separately. Candidate parsing owns a copy of the resolver bytes,
matching the production repository. HarfBuzz WASM initialization belongs to old
bootstrap setup; new static JavaScript evaluation belongs to module loading.
Neither is browser download/startup, which the native companion measures.

Within each case the order is parse/setup, first shape, 128 warm shapes, first
unique paths/curves, sixteen warm path passes, first wrapped layout, then the
specified number of independent layouts/new atlas packs. Font/outline caches
remain warm during that final preparation loop. Every atlas is disposed; this
is CPU preparation, not a live-editor cache-hit or GPU timing claim.

`artifacts/text-shaper-migration/cpu-observations.ndjson` preserves the six original fresh-process metadata/timing
records without rounding, plus SHA-256 identities of the complete ignored raw
JSONs. Those originals also preserve commands, bounds and placement arrays.
Generated observations/provenance stay in ignored artifacts. The original measured harness/adapters/snapshots remain frozen under
`artifacts/text-shaper-migration/`; this tracked runner makes the procedure
reproducible from the old worktree after those artifacts are removed. Its loader
uses the original worktree directly rather than the historical copied snapshot.
Do not mix a future reproduction with the historical observations.

See [the CPU report](../../../../docs/performance/text-shaping.md) for all three
observations and medians, independent correctness oracles, retained diagnostic
failures and the limits of the comparison.
