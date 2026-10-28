# Stabilization handoff — 2026-10-28

The user wants the current fixes finished and verified, then a quick continuation in
a new conversation. **Do not add features.** Read `AGENTS.md` and the domain contracts.
The release number is still `0.1.0`; no release has been declared.

The private checkpoint is on `main`: `a49a856`, followed by the owner-bound mask
removal fix `10916ef` and the final UI/native-test checkpoint (see `git log`). The
user requested an immediate conversation handoff. The implementation is saved;
the outstanding checks below must not be mistaken for a completed release.

## Current implementation

- Real indexed snapping for moves and corner resize, nested groups and artboards;
  engaged-only measurements, persistent screen-pixel threshold and command actions.
- Four-category preferences sidebar, shared theme segmented control, Magnet numeric
  handle and a real snapping sandbox in a compact popover without layout expansion.
- Project-wide virtual artboard layer tree and bounded, genuine image/effect/mask
  previews. Always-visible attachment cards are bounded to two effects and one mask.
- Typed attachment selection: deleting an effect/mask through footer, context menu,
  keyboard or command search cannot fall back to deleting its parent layer.
- Simplified wand tolerance/help, stable screen-space outline, Keep/Erase actions,
  Ctrl/Cmd+D deselection and Delete/Backspace erasure preserving existing masks.
- Worker model progress in actual MB/percent, cancellation, cache inspection and
  deletion. Pinned model files total 39,834,751 bytes; shared runtime is retained.
- GPU artboard continuity, no stale thumbnail beneath transparency, bounded heading
  collision placement, viewport-fitting guide presets and individual guide colors.
- Earlier worker journal/fragmented hashing/manifest persistence and performance fixes
  remain in the tree. They need the final integrated storage/input timing cohort.

## Evidence already obtained

- `artifacts/artboard-layers-render-integration-unit.log`: 184/184 focused checks.
- `artifacts/snapping-final-focused-unit.log`: 96/96 checks before the last UI edits.
- `artifacts/model-focused-final-unit.log`: 31/31 model checks.
- Native artboard transparency, continuity, extreme-zoom headings, guide presets at
  two viewport heights, preferences and mask thumbnail-drop behavior passed in earlier
  frozen candidates. Keep those separate from validation of the final combined tree.
- `artifacts/snapping-performance-10000.json`: real single-layer dragging among 9,999
  targets on Chromium 156, Intel xe-lpg, DPR 1, cgroup CPU 200%, memory 4 GiB, swap 0.
  First capture→matching GPU presentation: 65.2 ms; warm moves: 18.8–21.0 ms.
  Outer editor React commits and GPU/WebGL/Canvas read APIs stayed unchanged/zero.
  **This does not establish instant commit latency for moving all 10,000 layers.**
- Two native wand scenarios passed before the final simpler toolbar/outline changes.
- Failure archives preserve the original heading infinite-loop candidate and clipped
  guide popover; both source fixes were verified natively afterwards.
- The full unit attempt (`artifacts/handoff-coverage.log`) ran 1,697 tests across
  497 files: 1,696 passed, one mask-removal regression failed, and a separate audit
  suite failed during bootstrap because its partial i18next mock omitted the plugin.
  Both failures were corrected in `10916ef`; the affected suites passed all four
  tests together (`artifacts/handoff-regression-rerun.log`). That failed full run
  produced no coverage report and does not establish the coverage thresholds.
- The final production candidate `artifacts/handoff-final-dist` passed seven native
  cases: genuine inactive-artboard image/dither/mask thumbnails, three wand cases,
  the short-window shortcut editor, actual model download/cache removal without
  navigation, and persisted command-search/snapping-sandbox integration. Two further
  failures were stale test assumptions: the sandbox now lives in a portal, and an
  unsnapped browser coordinate differs by approximately 0.00000013 document pixels.
  Their assertions were corrected without relaxing snapped-value or undo checks.
- The preceding layer cohort passed nested FX/mask/group behavior and found a real
  attachment-card CSS selector mismatch (24 pixels instead of the intended 30).
  It also found stale native focus/Select locators; the follow-up preserves the
  original hit-area and document assertions. These cases still require a rerun.

## Blocking verification to finish

Check the newest `artifacts/handoff-*.log` files and active process before launching
anything. Final source TypeScript, both linters, source rules and the production
build passed before the small final CSS/test follow-up. The final full coverage
rerun (`artifacts/handoff-coverage-final.log`) was stopped after approximately two
minutes for the user's immediate handoff; its owned systemd scope was terminated
cleanly. It is incomplete, with no final coverage result. **Do not claim 85%
coverage or a full native pass until a fresh run and the coverage-aware rules check
succeed.**

1. Resolve concrete final lint or mirrored-test failures; do not weaken gates.
2. Full coverage, then `bun run check:coverage`, rules, versions, frozen install,
   formatting, both TypeScript projects, linters and production build.
3. Run the final native cases: `attachment-selection`, `layer-thumbnails`,
   `pixel-selection`, `snapping`, `snapping-preferences`, `preferences`,
   `segmentation-manager`, guide/artboard/viewport cases and layer controls.
4. Run actual 50-image/effects, 10,000-element movement/follow-up input, pending
   worker journal, persistence fault cases and 100,000-event storage workloads.
5. Record actual outcomes in performance docs and the English changelog; commit
   verified milestones and push only to the existing private repository.

## Runtime and resource ownership

- Repository: `https://github.com/ExtraBinoss/MusArt` — verified **private**.
- Development port: **6100**. The isolated production preview uses **4181** and
  `artifacts/stabilization-integrated.config.ts`.
- Preview output: `artifacts/handoff-final-dist` (source `10916ef`); old failed candidates
  have separate directories and matching source maps. Do not overwrite their traces.
- An existing development server already listens on port 6100. It is not owned by
  the final verification runner; do not stop it merely to launch another server.
- Current native archive: `artifacts/handoff-native-layer-findings/`. Preserve the
  newer `artifacts/stabilization-native.log`, fixed-name JSON report and browser
  output before launching another cohort. `artifacts/run-native-serial.py` uses
  `artifacts/stabilization-integrated.config.ts` with a single browser worker.
- Run one heavy command at a time across all agents. One test worker, low priority,
  CPU/memory caps and no swap are essential: a previous unbounded overlap rebooted
  the user's workstation. Follow `docs/performance/protocol.md`.
- Keep native timing separate from coverage/build/typecheck. Do not use Vitest's VM
  pools: the attempted VM pool lacked compatible crypto/cross-realm behavior.
- All feature agents are frozen; ask them only to fix concrete validation failures.
- No verification job remains running after the handoff. The existing development
  server and the bounded production preview remain available; the latter intentionally
  serves the `10916ef` candidate, before the final attachment-card CSS correction.

Before answering the user, update this handoff with the final commit and measured
status. Requested work is not a release merely because the source was checkpointed.
