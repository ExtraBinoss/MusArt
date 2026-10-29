# Motion/video build checklist

This is a claimable delivery plan, not a statement that Motion has been implemented. Each task owns a bounded domain, identifies dependencies and lists the evidence needed before it can be checked off. Stable requirement IDs come from [requirements.md](requirements.md); original wording is in [the brief](user-brief.fr.md).

## Status and task ownership

| Status          | Meaning                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------- |
| `planned`       | Requirements and task contract exist; implementation is not claimed.                        |
| `ready`         | Dependencies and consequential product decisions are resolved; an agent can claim the task. |
| `active`        | An owner is implementing the declared paths.                                                |
| `verification`  | Code exists and focused checks are being executed; authored tests alone are not a pass.     |
| `verified`      | Required checks and independent review passed, with evidence recorded.                      |
| `user-deferred` | Explicitly scheduled by the user after the first stabilized video/timeline delivery.        |
| `integrated`    | The verified milestone has its own deliberate commit on the feature branch.                 |

Implementation tasks start `planned`, except the explicitly `user-deferred` camera phase T15. Only preparation has produced files so far. Do not mark an entire capability complete because a UI control or a mock exists.

## Dependency waves

| Wave                                 | Tasks              | Parallelism and gate                                                                                                                                                              |
| ------------------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preparation                          | T00                | Research, requirements and architecture can run independently. Freeze shared contracts before source edits.                                                                       |
| Portable foundation                  | T01, T02, T03      | One core owner controls shared document/command barrels; interpolation and registry helpers can be delegated after interfaces are agreed.                                         |
| Media and transport                  | T04, T05, T06, T07 | Media/storage and renderer owners can work on separate modules against the frozen frame-source/time contracts. Scrub infrastructure is mandatory, not a last-minute optimization. |
| Authoring interface                  | T08, T09, T10, T11 | Timeline and inspector owners use the same temporal commands, property IDs, playhead and gesture transactions. The integration owner controls App/shell files.                    |
| Audio, export and existing workflows | T12, T13, T14, T18 | Source audio and Mediabunny export share timestamps, clip ranges and backpressure. Migration/history/clipboard must preserve the new document data.                               |
| Live direction                       | T15                | User-deferred until file video/timeline stabilization (M16). Keep the future task and recording/determinism contract visible.                                                     |
| Integration and proof                | T16, T17           | Heavy browser/GPU/storage/coverage/build checks run serially under the shared protocol. Independent audits precede final delivery claims.                                         |

## T00 — Freeze research, product decisions and integration contracts

**Owner:** root integration agent, with independent UX/requirements/media research agents. **Dependencies:** none. **Requirements:** WORK-01–04, DOC-01–05, TIM-04, PERF-01–05.

- [x] Create `feat/motion-video` and the separate `MuseArtWeb-motion` worktree at the recorded base commit; preserve main's dirty work.
- [x] Install worktree-local frozen dependencies rather than resolving feature packages through main's workspace links.
- [x] Preserve both supplied screenshots and all user messages/Q&A verbatim.
- [x] Run the isolated development server on port 6110; verify an actual HTTP response and leave 6100 alone.
- [x] Complete source-linked Figma research, screenshot observations, parity matrix and independent requirement trace inventory; final cross-document audit remains below.
- [x] Record all eight explicit product answers and later Timelapse/headless clarifications. Unasked engineering proposals remain labeled; freeze their affected contracts before dependent code.
- [ ] Freeze a shared contract for time units/FPS, interval boundaries, property addresses, media-frame revision, document migrations, audio/proxy ownership and preview/export evaluation.
- [x] Record a baseline verification plan and resource coordinator; no performance pass is inferred from the existing photo renderer.

**Evidence:** docs link/ID audit, screenshot hashes, dependency freeze, branch/worktree identity, 6110 HTTP check, named unresolved decisions. No production feature behavior is claimed here.

## T01 — Portable per-artboard temporal schema and validated commands

**Owner:** core agent. **Dependencies:** T00. **Owned paths:** new `packages/core/src/motion/` and exact test mirrors; coordinated document/validation/command handler changes. **Requirements:** CMP-01–11, TIM-05/06, TIME-01, ENG-01/02, G-01/03.

- [ ] Add independent Static/Motion mode and a versioned timeline to each artboard; keep a persisted initialization marker even when every track has been deleted.
- [ ] First initialization adopts each canonical eligible layer once, over the composition duration. Count all tracked layers, including groups and descendants; exclude effect/property rows from the displayed item count.
- [ ] Expose the exact newly adopted set so the UI confirms strictly more than three items; 0, 1 and 3 skip that threshold, 4 requires it.
- [ ] Make mode conversion, initial adoption, import insertion and duration extension one validated operation/transaction; cancellation leaves no partial graph.
- [ ] Preserve track/key identities, ranges, curves and source references across repeated switches. Static displays/edits base values with dormant animation.
- [ ] Define how a new layer added during a later Static visit obtains its own default range without rebuilding existing tracks.
- [ ] Preserve the distinction between inherited whole-duration ranges and explicit user trims; extending for a longer video never shortens another track.
- [ ] Add commands for track moves/trims and key add/update/move/delete; reject stale/invalid IDs, invalid times, nonfinite values and impossible intervals.

**Checks:** exact model/command mirrors; migration round trips; nested groups and masks; duplicate/delete; undo/redo; first-activation threshold; repeated toggles; initialized-but-empty timeline; atomic rejection and rollback.

## T02 — Typed animation capabilities for every existing effect and suitable property

**Owner:** core/property-contract agent. **Dependencies:** T01. **Owned paths:** motion property registry, definition metadata and mirrors. **Requirements:** KEY-01–05, CMP-01, TIME-01, ENG-01, G-01.

- [ ] Inventory every existing effect definition and expose stable typed addresses for effect identity, parameter scope and property key.
- [ ] Include transforms, opacity, color/fill/gradient and suitable text/layout properties; explicitly classify numbers, colors, angles, integers, booleans, enums and strings.
- [ ] Define valid discrete/HOLD behavior for choices and integer seeds; avoid invalid intermediate parameter values or silently unsupported effect types.
- [ ] Keep structural identity/reference edits outside arbitrary keyframe paths; validation must use an allowlisted typed registry.
- [ ] Specify base-value edits versus animated-value edits, keyframe arming, mixed selection and conditional controls.
- [ ] Distinguish an effect's authored phase/time from automatically following composition time and from an explicitly keyframed phase. Fixed settings still process every video frame.
- [ ] Produce an exhaustive capability test keyed to the actual effect catalog so future effects cannot be forgotten.

**Checks:** every effect, all declared parameter types and ranges, colors/gradient stop topology, invalid addresses, deleted effects, serialization and no-op key updates.

## T03 — Deterministic compiled timeline evaluation

**Owner:** pure evaluator agent. **Dependencies:** T01, T02. **Owned paths:** motion compilation/evaluation/easing helpers and mirrors. **Requirements:** TIME-01–03, KEY-03–05, TIM-06, CMP-01/07/09, ENG-01.

- [ ] Use the agreed canonical timebase and rational FPS; define half-open interval boundaries and exact API timestamp rounding.
- [ ] Evaluate the same authored state at a requested time independently of seek order, refresh rate, wall-clock scheduling and previous playback.
- [ ] Compile searchable tracks/keyframes once per authored revision; reuse unchanged data instead of cloning/validating the complete project on every frame.
- [ ] Define nested group/child visibility, mask dependencies and the time domain used by layer/effect properties.
- [ ] Keep move, source trim, visibility trim and animation stretch distinct; preserve out-of-range keys rather than destructively deleting them during ordinary trim.
- [ ] Apply the verified incoming-key easing convention, including explicit HOLD boundaries and deterministic custom Bezier/spring evaluation.
- [ ] Return a frame plan/effective property view without mutating base documents, undo state or the durable edit journal.

**Checks:** forward/backward/random order equivalence; boundaries; fractional FPS; long durations; nested groups/masks; invalid curves; constrained values; exact matched-time export inputs; large keyframe sets.

## T04 — Binary video assets, metadata and atomic import

**Owner:** media/storage agent. **Dependencies:** T00, T01. **Owned paths:** app media import/storage adapters and coordinated portable schema. **Requirements:** MED-01/03, CMP-04–07/11, PROXY-01, AUDIO-01, G-03/04.

- [ ] Probe actual media metadata, duration, dimensions, orientation, source timestamps, audio presence and decoder support; do not accept a filename extension as proof of capability.
- [ ] Store original video bytes separately from frequently changed manifests/journals; use durable IDs, bounded lazy reads and incremental accounting.
- [ ] Include the staged imported video in the exact newly tracked set when it receives a track; the displayed count must equal the committed result.
- [ ] Build the import/conversion/count operation before committing. Successful video import enables Motion and extends duration when necessary; No/failure/stale completion leaves no partial import.
- [ ] Reuse original bytes for repeated clips/layers and preserve image/text overlays and existing artwork order.
- [ ] Enforce memory/transport/quota limits, visible errors and project-retirement guards; late import work cannot recreate deleted data.
- [ ] Preserve original audio metadata and the agreed per-video mute/volume settings.
- [ ] Design portable media packaging and compatibility explicitly; do not put large videos into repeated dataUrl snapshots.

**Checks:** valid/unsupported/corrupt files; variable frame rate; portrait rotation; shared assets; quota and close races; 3+1 count boundary; canceled conversion; reload/import/export integrity and source hashes.

## T05 — Dynamic sources through the existing GPU compositor

**Owner:** render agent. **Dependencies:** T03, T04. **Owned paths:** render source preparation/cache/composition adapters and mirrors. **Requirements:** CMP-01, MED-01, KEY-04, TIME-03, PERF-02/03, G-02/04.

- [ ] Introduce retained image/video/live source providers using Three's texture resources; no alternative renderer or handwritten shader pipeline.
- [ ] Bind actual media frame revisions/timestamps into cache dependencies, including processed ancestors and masks; immutable document identity alone cannot certify a live frame.
- [ ] Reuse textures/materials, invalidate only affected graph paths and prevent one retained cache entry per elapsed frame from accumulating.
- [ ] Preserve effect authored units/reference planes, alpha, working-color conversion, orientation, masks, groups and preview/export sampling semantics.
- [ ] Bound decoded frames and GPU resources, close superseded frames and dispose decoders/textures/URLs on project switch, layer deletion and runtime teardown.
- [ ] Keep inactive artboards frozen and background GPU work behind active media/gestures according to the shared resource protocol.

**Checks:** decoded native pixels on WebGPU and WebGL; image/text above video; all effect types; transformed/masked groups; changing frames through retained caches; source replacement; zero production readbacks; cleanup/recovery.

## T06 — Per-artboard transport and imperative presentation

**Owner:** runtime/presentation agent. **Dependencies:** T03, T05. **Owned paths:** app motion session/transport/presentation services and adapter mirrors. **Requirements:** CMP-07/08/10, TIM-08, TIME-01/03, PERF-02, AUDIO-01.

- [ ] Play only the active composition and retain each composition's independent playhead; pause/suspend inactive media and GPU work.
- [ ] Drive effective values, the GPU scene, playhead, time labels and property displays through stable imperative subscriptions.
- [ ] Keep verified play/pause and loop/once/ping-pong as transport state rather than per-frame document commands. Define reverse video and source-audio behavior before exposing Ping-pong as functional.
- [ ] Treat stepping/playback speed as explicit engineering proposals until reference/scope is settled; speed needs a defined source-time and audio-pitch policy, not invented Figma hotkeys.
- [ ] Reconcile composition time, media presentation timestamps and audio timing; avoid cumulative timer drift.
- [ ] Handle focus, page visibility, source readiness, mode changes, export capture and disposal explicitly.
- [ ] Resolve Space-to-play versus existing Space-drag pan through a tested focus/gesture policy; text fields retain native editing.

**Checks:** play/pause/resume; arbitrary seek; composition switches; hidden/failed renderer; held pointer/keyboard gestures; audio start policy; no per-frame App/Inspector/CanvasArea/EditorCanvas/EditorScene commits or journal writes.

## T07 — Bidirectional instant-feeling scrub and automatic local previews

**Owner:** media scheduling/performance agent. **Dependencies:** T03–T06. **Owned paths:** seek/decode/proxy/cache services and mirrors. **Requirements:** PERF-01–05, PROXY-01, TIME-01–03, MED-01/03.

- [ ] Update the playhead immediately and keep a generation-scoped requested timestamp distinct from the last correctly presented video frame.
- [ ] Coalesce seeks to the newest intent, cancel superseded work and reject old frames after rapid direction changes, track edits or artboard/project replacement.
- [ ] Use indexed source timestamps, bounded decoder work and bounded bidirectional frame caches; cover random GOP access and variable-frame-rate clips.
- [ ] Generate optimized local preview media automatically when necessary, with actual progress/cancel/error states, bounded storage and source/settings fingerprints.
- [ ] Keep playback and proxy generation responsive to current input; prioritize the active requested frame and avoid unbounded worker/GPU queues.
- [ ] Export through Mediabunny from originals only. Never silently substitute a proxy, cached wrong-time frame or screen capture for original export work.
- [ ] Benchmark cursor response AND correct-frame presentation separately for cold/warm forward, backward, rapid-reversal, random and heavy-composition seeks.

**Checks:** real encoded fixtures and native decoders; cache eviction; proxy invalidation; canceled/failed preparation; repeated reversals; exact timestamp acceptance; memory bounds; original-versus-proxy distinction; raw timing distributions and honest misses.

## T08 — Bottom timeline shell, controls and editor navigation

**Owner:** timeline UI agent; root owns App/shell integration. **Dependencies:** T01, T06 and frozen UX contract. **Owned paths:** new timeline components/styles, coordinated shell/navigation changes and mirrors. **Requirements:** TIM-01–05/07/08, CMP-02/05/07/08, HIST-01/02, WORK-02.

- [ ] Place the resizable/collapsible timeline along the bottom; replace the bottom-right Recenter affordance with the Motion timeline toggle.
- [ ] Move zoom +/− to the top-right with Design-related controls; preserve usable exact 100%/fit and pointer-centered navigation.
- [ ] Expose composition-scoped Static/Motion selection and the strict counted first-initialization dialog with real Yes/No behavior.
- [ ] Match Figma's restrained rows, ruler, property hierarchy, selected bars/diamonds, playhead and compact controls using genuine shadcn/Radix primitives and MusArt branding.
- [ ] Implement editable current-time jump, s/ms unit toggle, duration field/end affordance, temporal zoom slider/pinch/Ctrl-Cmd-wheel, individual row expansion, collapse/expand-all layers, and whole-panel minimize/resize. These are distinct operations.
- [ ] Implement verified playback modes and a separate explicit Auto-keyframe control with visible recording/playhead indicators, plus Static/focus guards. Do not ship decorative parity controls with no behavior.
- [ ] Virtualize visible rows/key marks/ticks; synchronize labels and track geometry without mounting the whole document.
- [ ] Persist appropriate per-artboard presentation state; resizing/opening cannot destroy authored tracks or reset another timeline.
- [ ] Keep full English/French text, keyboard/focus semantics, short-window usability and reduced-motion behavior.

**Checks:** real screenshots against both supplied references; 0/1/3/4 conversion; repeated mode toggles; artboard switches; small/short viewports; native wheel/zoom; active row reveal; focus restoration and zero unnecessary root commits.

## T09 — Inspector diamonds and real property keyframing

**Owner:** inspector/property UI agent. **Dependencies:** T01–T03, T06, coordinated shared-field contracts. **Owned paths:** generic property/effect field adapters and mirrors. **Requirements:** KEY-01–05, TIM-04, CMP-09, G-03.

- [ ] Add a compact accessible diamond beside supported properties, with distinct unanimated/animated/current-key states.
- [ ] First click stores the current effective value at the playhead. Later edits at another time add the next key for that armed property; edits at the same time update the existing key.
- [ ] Global auto-keyframe is a verified parity deliverable: a separate explicit mode with visible capture/playhead indicators, focus/Static guards and accidental-key prevention. Any deferred parity must be named, not hidden behind an inert toggle.
- [ ] Support all existing effect types through the registry, including numbers, colors, choices and conditional fields; no effect-specific animation switches scattered through the inspector.
- [ ] Keep continuous field/color/scrub previews imperative, commit one validated keyframe edit per completed gesture and restore on cancel.
- [ ] Capture engine/page/revision/selection/property/time origin so a moved playhead or replacement target cannot receive a stale draft.
- [ ] Static edits affect the base design; they do not rewrite dormant curves. Playback/read-only display cannot create accidental keys.

**Checks:** every effect catalog entry; transform/color/type variants; multiple selection; repeated timestamps; moving playhead during a gesture; cancel/undo/redo; persistence; input keyboard behavior; native field interaction and actual rendered values.

## T10 — Track/key selection, movement, trimming and snapping

**Owner:** timeline interaction agent. **Dependencies:** T01, T03, T08. **Owned paths:** timeline gesture controllers and mirrors. **Requirements:** TIM-04–08, KEY-02/03, TIME-01, PERF-02/05, G-03.

- [ ] Implement verified single/Shift/marquee key selection, double-click-to-seek, timeline-layer selection of its keys and property-row Delete of its own keys; deletion scope must never fall through to deleting the artwork.
- [ ] Treat previous/next-key arrows as screenshot-observed controls until their exact target/keyboard behavior is verified; record any chosen MusArt rule explicitly.
- [ ] Give source-aware left/right clip trims and animation-span stretching distinct affordances and commands. Test that trimming does not accidentally retime animation and stretching does not silently alter a video source-in point.
- [ ] Preserve verified Shift-drag snapping to playhead/other keys. Define source-trim and animation-stretch modifiers/handles separately; an extra bypass modifier is a named MusArt adaptation until verified. Keep edge auto-scroll and zoom-independent pointer math deterministic.
- [ ] Apply explicit group/subtree timing behavior and preserve relevant off-range keys on ordinary trim.
- [ ] Update retained DOM geometry imperatively during drag, without mutating portable state until a valid drop/release.
- [ ] Cancel cleanly on Escape, pointer cancellation, lost capture, project/artboard/revision change and disposal; publish one undo entry per completed gesture.

**Checks:** real pointer/keyboard tests at several timeline zooms and fractional display scales; multi-key moves; source-in/trim math; bounds; auto-scroll; group hierarchy; stale origins; undo/redo; input latency and React commit counters.

## T11 — Easing inspector and deterministic curve editing

**Owner:** easing/core + UI agent pair. **Dependencies:** T02, T03, T08–T10. **Requirements:** KEY-03, TIM-04, TIME-01–03.

- [ ] Offer the verified Figma easing families and HOLD semantics; record any deliberate gap instead of claiming complete parity.
- [ ] Open easing from the connector between keyframes, as verified in Figma. Make segment/diamond selection and the incoming-easing convention explicit in storage and UI.
- [ ] Provide real configurable Bezier/spring controls with meaningful preview and validated ranges; do not use wall-clock spring simulation for deterministic export evaluation.
- [ ] Support overshoot where the property's valid domain permits it, with consistent constraint handling.
- [ ] Make curve edits cancellable, undoable and preserved across mode switches and save/load.

**Checks:** endpoints, midpoint/overshoot, HOLD exact boundary, custom curves, fractional FPS, invalid curves, native curve gestures, rendered preview/export values and one-entry undo.

## T12 — Original-video audio with per-track mute/volume

**Owner:** media/audio agent. **Dependencies:** T03, T04, T06. **Requirements:** AUDIO-01, MED-03, TIM-06, TIME-02/03, G-04.

- [ ] Preserve source audio and present per-video-track Mute and Volume; a silent-first export is not the selected scope.
- [ ] Align audio sample time to clip placement, source trim, playback speed and composition time; define behavior on seeks, pause, loop and composition switches.
- [ ] Mix overlapping source audio through a bounded pipeline with the agreed gain/clipping policy; separate container tracks do not constitute an audible mix.
- [ ] Respect browser audio activation and codec capabilities, and surface failures without silently discarding required sound.
- [ ] Feed synchronized original-source audio into the same Mediabunny output; preview proxies never become the export's audio source.
- [ ] Release audio contexts/nodes/decoders/PCM queues and reject stale work on source removal and teardown.

**Checks:** audible native fixtures; source trim/offset; overlapping videos; mute/volume; loop/seek; sample timestamps; decoded A/V alignment; cancellation; cleanup and memory bounds. Separate imported audio-editor tracks are not the selected first-version requirement.

## T13 — Deterministic original-source export through Mediabunny

**Owner:** export agent. **Dependencies:** T03–T07, T12. **Requirements:** MED-03, TIME-01–03, PROXY-01, AUDIO-01, KEY-04, G-02/04.

- [ ] Snapshot the authored composition and use exact output frame indices/rational FPS; define frame count/end-time rounding explicitly.
- [ ] Decode the original media sample for every requested timestamp, evaluate properties, render through the existing GPU graph and await the encoder's backpressure.
- [ ] Use Mediabunny for video encoding/container output and synchronized source-audio mixing/muxing. Do not record interactive preview timing or export proxies.
- [ ] Keep pending decoder/frame/encoder/GPU work bounded; support progress, cancellation, unsupported codecs, quota/output limits and real failures.
- [ ] Preserve resolution, alpha/container capability, working-color conversion, orientation and effect/time semantics.
- [ ] Validate exports by native decoding in a separate uninstrumented inspector; production rendering performs no GPU pixel readbacks.

**Checks:** output frame count/timestamps/duration; backward-then-export equivalence; original-frame witness; all effect types; image/text overlays; masks/groups; proxy-preview versus original export; source audio sync; codecs; cancellation and repeated cleanup.

## T14 — Persistence, history, clipboard and Timelapse integration

**Owner:** platform/history integration agent. **Dependencies:** T01, T04 and relevant UI/export tasks. **Requirements:** CMP-01/03/07/09, HIST-01–03, TIME-02, WORK-03, G-03/04.

- [ ] Preserve timelines, keys, easing, source references, audio settings and mode across actual reload, project duplication, portable import/export and editable copy/paste.
- [ ] Remap durable layer/effect/track/key identities coherently; shared media bytes must not be duplicated per keyframe or history entry.
- [ ] Record completed authoring gestures in the existing journal without recording playback/scrub frames; extend validated commands and replay compatibility deliberately.
- [ ] Replace the old Animate surface with a Timelapse action under Export’s split-button down-chevron menu. Keep its entry, focus, cancel and export behavior distinct from authored Motion.
- [ ] Open a deliberately simple Timelapse dialog explaining the recorded-creation replay, with preview and final output duration from 1 to 30 seconds inclusive. Automatically map the full recording to that duration; do not clone the old Animate panel and all its controls into this dialog.
- [ ] Enforce Timelapse duration boundaries and retiming in its service contract. This limit does not cap authored Motion-video exports. Preserve journals and distinguish recording time, composition time, source-media time and final timelapse output time.
- [ ] Preserve project deletion/retirement, compare-and-swap, atomic accounting and asynchronous stale/disposal guards.

**Checks:** native IndexedDB reload, copy/paste between artboards/projects, shared assets, UUID collision guards, stale concurrent saves, delete races, undo/redo and old project/history import. Timelapse checks include 1-second and 30-second acceptance, below/above-bound rejection, invalid input, complete-journey faster/slower retiming, preview/export agreement and cancellation. A separate Motion export longer than 30 seconds must remain valid.

## T15 — Live camera direction and recording

**Owner:** live-media agent. **Dependencies:** T04–T07, T12/T13. **Requirements:** MED-02, CMP-01, KEY-04, TIME-02, G-02/04.

- [x] Record M16: the user schedules camera after video and timeline stabilization. T15 is `user-deferred`, not an unreported first-delivery omission.
- [ ] Schedule live camera/recording only after that gate, preserving its documented contracts.
- [ ] Use a live media provider through the same effects/layer graph; keep camera handles and frames outside portable documents.
- [ ] Define Live versus recorded playback honestly: seeking the past requires recorded media, and repeatable export uses the recorded source.
- [ ] Provide device permission/error/stop/reconnect behavior, bounded recording and explicit track/decoder/frame/resource release.
- [ ] Apply composition/effect animation consistently without claiming an unrecorded camera stream is deterministic replay.

**Checks:** real/fake-device browser media streams as declared; live effects and overlays; permission rejection; stop/disconnect; recording/reopen/export; background/hidden-tab behavior and cleanup.

## T16 — Profile, stress and tune the actual integrated feature

**Owner:** performance agent; root owns the single heavy-check schedule. **Dependencies:** each functional domain before timing; T05–T14/T18 for final cohorts. **Requirements:** PERF-01–05, CMP-10, TIM-07, PROXY-01, TIME-03, G-02/04.

- [ ] Freeze the executable, source maps, tracked/untracked diff, browser, backend/actual adapter, viewport/DPR, codec/source metadata and process limits.
- [ ] Measure cold preparation, first useful frame, warm playback, continuous/random/reversing scrub, key/track drags and next input while persistence remains pending.
- [ ] Separate generated input → dispatch, handler → feedback, requested time → correct frame, CPU/GPU submission, audio sync and encode/export throughput.
- [ ] Record p50/p95/p99/max, frame gaps, long tasks, actual React commits, source uploads, decoders, contexts, targets, GPU/cache bytes, PCM/frame queues, object URLs and storage reads/writes.
- [ ] Include the relevant existing 50-image/100-effect workload plus mixed video/image/text/mask compositions, multiple visible Motion artboards, long GOP/VFR media and large virtualized timelines.
- [ ] Verify inactive compositions stay frozen; continuous play/scrub/gesture work creates zero major-root React commits and zero production readbacks.
- [ ] Define and test proposed ~16 ms-or-better budgets per workload/hardware; retain every failure, distinguish cold from warm and do not hide lower quality or wrong frames behind cursor speed.
- [ ] Keep only one heavy CPU/GPU/browser/storage cohort active at a time. Stop on pressure; do not raise limits or weaken assertions to manufacture a pass.

**Evidence:** raw/native clock traces, exact workloads and source provenance, decoded images/media, screenshots, actual API probes and before/after comparisons. RAF schedules presentation; it is not a 16 ms processing floor or proof of performance.

## T17 — Independent audit and deliberate milestone delivery

**Owner:** independent reviewers; integration agent fixes findings. **Dependencies:** completed domain milestones, including T18 for headless delivery. **Requirements:** all feature/process IDs, including ENG-01/02, and G-01–05.

- [ ] Audit readability and generic design: small responsibility-based modules, short public entry points, typed extension points, clear invariants, no giant property/effect switches, duplicate evaluators or needless wrappers.
- [ ] Have a different agent audit completed core, media/export and UI domains for requirements, time/math, native correctness, transactions, cleanup and performance claims.
- [ ] Fix findings and rerun only affected checks. Authored-but-unrun or unavailable native cases remain explicit gaps.
- [ ] Run focused mirrored tests and relevant static checks; require zero rules violations before each commit and synchronized workspace versions.
- [ ] Keep every feature/fix documented under Unreleased in English; commit verified milestones separately on this branch.
- [ ] Never stage dependencies, generated builds/reports, private media or main's parallel work. Keep the requested 6110 server and identify it clearly.
- [ ] Report implemented/deferred/unverified Figma parity, actual measured budgets and known device/codec limits. Full release gates remain a separate requested/CI activity.
- [ ] Do not merge into or publish main merely because the worktree exists; preserve the user's current main history and workspace.

## T18 — Generic headless API and platform adapters

**Owner:** core/headless integration agent. **Dependencies:** T01–T07 for author/evaluate; T12/T13 for rendered A/V export. **Owned paths:** short core public exports, headless CLI modules/platform adapters and exact mirrors; coordinate source ownership with T01/T03/T13. **Requirements:** ENG-01/02, TIME-01–03, KEY-04/05, MED-03, WORK-03, G-01/02.

- [ ] Expose the generic schema, typed property registry, validated commands, keyframe/easing/compile/evaluate interfaces independently from the visual editor.
- [ ] Prove document creation, keyframing, trimming and arbitrary-time evaluation in plain Bun/Node without DOM, React, Jotai, storage or GPU dependencies in core.
- [ ] Keep media IO, decoded frame ownership, GPU rendering and encoding behind explicit platform adapters. GPU/headless-browser requirements remain honest; headless core does not imply a native Node GPU renderer.
- [ ] Choose and document a practical headless delivery surface. Extending the existing CLI with author/evaluate/render/export operations is an engineering proposal, not an additional user-selected product requirement. Any CLI must use the same engine and original-media/Mediabunny pipeline as the app, without a separate animation implementation or per-effect special cases.
- [ ] Verify UI-authored and headless-authored documents evaluate and export equivalently at matched timestamps, including effects, groups/masks, trims, audio and saved/reloaded timelines.
- [ ] Document concise executable API/CLI examples and errors, lifecycle ownership and extension rules. Keep public entry points short and code readable.

**Checks:** no-DOM core suite/import boundary check; exact mirrored CLI/adapters tests; native headless media/GPU export/decoded pixels and A/V timing; malformed input and canceled/stale jobs; generic effect-catalog coverage and source/preview/export agreement.

## Required agent return format

| Field          | Required content                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| Task and scope | Claimed T-ID, mapped requirement IDs and owned paths.                                                   |
| Contracts      | Imported/exported types, time/property/source ownership and any coordinated shared-file changes.        |
| Result         | User-visible behavior, invalid/cancel/error paths and remaining gaps.                                   |
| Verification   | Exact commands, actual outcomes and ignored report/capture paths; distinguish authored tests from runs. |
| Performance    | Workload/environment/boundary and raw distributions when a timing claim is made.                        |
| Review         | Independent findings and how they were resolved.                                                        |
| Git            | Commit or deliberate file list; no unrelated staging, main changes or hidden generated output.          |
