# Performance diagnostics

Use these runbooks when changing a hot path or investigating an interaction regression. They describe reproducible workloads, code ownership and evidence requirements; they are not a promise of universal frame rates or a list of unfinished optimizations.

Read [AGENTS.md](../AGENTS.md) and [the architecture contracts](CONTRACTS.md) first. Keep release details in [CHANGELOG.md](../CHANGELOG.md), not in contribution instructions.

| Domain                          | Start here                                         | Primary boundary                                                          |
| ------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------- |
| Measurement and reproducibility | [Protocol](performance/protocol.md)                | Frozen builds, environment, isolated cohorts, clocks and artifacts        |
| Canvas interactions             | [Canvas](performance/canvas.md)                    | Navigation, selection, geometry, guides and drawing                       |
| React and interface layout      | [Layout](performance/layout.md)                    | Inspector, virtual layers, search, preview controls and browser layout    |
| Persistence and journals        | [Storage](performance/storage.md)                  | IndexedDB, autosave, concurrency, history and reload                      |
| GPU rendering and exports       | [Rendering](performance/rendering.md)              | Sources, composition, analytical text, effects and retained resources     |
| Visible thumbnails              | [Latency cohort](performance/thumbnail-latency.md) | Decoded previews after native scrolling and the first artboard activation |

The detailed [GPU workload and measurement protocol](rendering/performance-protocol.md) remains the source for the 50-image fixture, native pan/control comparison and recorded cohorts. Domain runbooks link to it instead of maintaining competing copies of its values.

## First investigation

1. Reproduce the exact user operation and retain its failure before editing code. Include first/cold behavior; do not warm the offending control away.
2. Classify the cost: input queue, JavaScript, React commit, style/layout/paint, GPU preparation/composition, native encoding or persistence. Zero GPU submissions alone does not prove a smooth canvas.
3. Trace the measured interval back to its owning source. Read the relevant domain contract and existing mirrored tests before changing the boundary.
4. Make one focused change, run meaningful unit/transaction/cleanup regressions, then compare an isolated native cohort. Mocks do not prove rendering or browser gesture behavior.
5. Preserve both failed and corrected reports with their matching source maps. Record limitations and remaining failures directly; do not turn an incomplete measurement into a success claim.

Only one native GPU/performance cohort runs at a time on a shared machine. Do not overlap it with coverage, unit workers, typechecking, bundling, another browser suite or another agent's workload. Functional checks and diagnostic traces also need explicit ownership of the GPU slot; tracing results are not interchangeable with clean timing runs.

Keep reports, screenshots, CPU profiles, traces, temporary configurations and frozen builds in ignored `artifacts/`. Before rebuilding or rerunning a fixed-name report, copy the previous cohort and its exact source maps into a named archive. Ignored artifacts are local evidence: a fresh checkout will need to generate them again.

## Completion checklist

- Preserve document values, one-gesture/one-undo behavior, stale-result rejection and disposal while improving latency.
- Require zero application JavaScript pixel readbacks. Native image preparation/encoding is permitted; test-only decoded-pixel validation must be separated from production counters.
- Check the five editor React surfaces during continuous previews, and inspect actual browser layout and frame gaps too.
- Keep caches/queues bounded and distinguish a retained source from an unbounded reference to an old project or original image string.
- Run frozen installation, version/rules checks, types, lint, formatting, coverage, the coverage-aware rules check, production build and affected native checks as required by AGENTS.md.
- Document the verified feature or fix in English, then commit the verified milestone deliberately. Do not stage generated evidence, dependencies or credentials.
