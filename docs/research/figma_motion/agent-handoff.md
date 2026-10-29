# Agent handoff and execution protocol

Use this alongside [the build checklist](build-checklist.md), [requirements](requirements.md) and the [decision register](decisions-and-open-questions.md). T18 is a shared headless delivery gate even though its stable ID is appended after T17; dependency waves determine execution order. A task can be claimed only after its dependencies and relevant product choices are settled. This document coordinates parallel work; it does not replace the repository contracts.

## Workspace contract

| Item                    | Contract                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Authorized tree         | `/home/albi/Documents/Projects/Hackaton/MuseArtWeb-motion`                                                                                                                     |
| Feature branch          | `feat/motion-video`                                                                                                                                                            |
| Base                    | `7ae8814`                                                                                                                                                                      |
| Interactive server      | `bun run dev -- --port 6110 --strictPort`; current HTTP response checked on 6110                                                                                               |
| Main                    | Do not edit, stage, reset, stop tools, merge or publish `/home/albi/Documents/Projects/Hackaton/MuseArtWeb` or its 6100 server.                                                |
| Dependency isolation    | Worktree-local `bun install --frozen-lockfile` completed. Shared global caches are fine; workspace package resolution must target this worktree.                               |
| Generated work          | Keep builds, reports, traces, video fixtures and captures in ignored `artifacts/`; use synthetic/public test fixtures with attribution when source fixtures must be committed. |
| Heavy-check coordinator | Root/integration owns scheduling. One heavy compiler/build/coverage/browser/GPU/storage process at a time, bounded workers and low priority; see the performance protocol.     |

## Current implementation ownership

| Agent                       | Owned documents                                                | Scope                                                                                                                 |
| --------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Root integration            | README, user-brief.fr.md, build-checklist.md, agent-handoff.md | Exact source preservation, questions/answers, plan dependencies, isolation, final completeness and deliberate commit. |
| `motion_ux_research`        | figma-reference.md, ui-ux-spec.md                              | Primary Figma research, screenshot observations, parity, controls, native interaction acceptance.                     |
| `motion_architecture`       | architecture.md, performance-and-verification.md               | Existing source seams, deterministic time/media/storage/export, measured performance strategy.                        |
| `motion_requirements_audit` | requirements.md, decisions-and-open-questions.md               | Independent inventory, stable IDs, decisions and loss-of-scope audit.                                                 |

The documentation-only preparation milestone is committed as `67dac3f`. Implementation was then explicitly requested in M21. Current source claims are: `motion_architecture` owns video-provider modules under `packages/render/src/sources/video/` and their native witness; `motion_requirements_audit` owns `components/motion/` timeline interactions/easing; `motion_ux_research` owns property authoring adapters/diamonds after completing Timelapse. Root owns core and App/transport/CLI integration. Agents do not commit or run simultaneous heavy cohorts; root schedules them. See the [implementation log](implementation-log.md) for actual results and remaining gaps.

## Confirmed product answers

The preserved brief now includes **M1–M43** and both later MusArt defect screenshots, alongside the initial Figma references. The UI/templates agent updated the raw brief, requirement refinements, T19–T21, implementation record and [integration audit](integration-audit.md) under root's explicit documentation handoff. Root resumes integration/commit ownership after that update.

Current later source scope: root owns App, PlaneResources scheduling/ownership and final native coordination; media owner owns binary import/storage/resolvers/providers/export adapters; timeline owner owns timeline controls, clipping, auto-follow and active-portal cleanup; UI/templates agent owns inspector authoring, Timelapse, headless templates/gallery loader, import-confirmation broker/host, MotionTimelineDock, then M41 CopyButton/EditorNotice. No agent touches main/6100 or launches a competing native cohort.

Do not infer completion from branch contents. Two native UI cases passed per root, with zero production readbacks and unchanged major-root counters during playback/Dock toggle; this is not production performance or original-source Motion A/V export evidence. Native media/cover work is the current prioritized gate. The template metadata and command files exist; native WebP covers, proxy/audio pipeline and binary archive portability remain explicit gaps.

| Question                    | Confirmed behavior                                                                                                                                | Source  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Static after Motion         | Display and edit the base design; keep dormant animation intact.                                                                                  | M10     |
| Heavy-video preview         | Automatically generate optimized local previews when necessary; export originals.                                                                 | M11     |
| Audio                       | Retain source-video sound with Mute and Volume per track; silent-only output is not the chosen scope.                                             | M12     |
| Visible Motion compositions | Play the active one only; freeze every other artboard.                                                                                            | M13     |
| Longer imported video       | Extend composition duration when necessary, without shortening existing tracks.                                                                   | M14     |
| Counted conversion          | Count every newly tracked layer, including groups and descendants; exclude effect/property rows.                                                  | M15     |
| Export engine               | Mediabunny owns export. Three.js owns GPU composition/effects.                                                                                    | M8      |
| Timelapse                   | Export split-button menu opens a simple dialog; final length 1–30 seconds automatically retimes the full creation replay.                         | M17–M18 |
| Generic/headless engine     | One reusable, readable temporal engine; UI and headless paths use the same commands, evaluation and platform adapters.                            | M19     |
| Camera priority             | Next step after file video and timeline stabilization.                                                                                            | M16     |
| Scrubbing                   | Bidirectional, reversing and random seeking is a first-class responsiveness requirement; distinguish cursor feedback and correct-frame readiness. | M9      |

All eight asked product questions have explicit answers. M16 schedules camera after video/timeline stabilization. M17 places Timelapse under Export’s split-button down-chevron; M18 narrows it to a simple replay/export dialog with final length 1–30 seconds and automatic full-recording retiming. M19 explicitly requires a generic, readable, headless-capable animation engine. Unasked engineering proposals remain labeled; they are not attributed to the user.

## Interfaces to settle before dependent implementation

| Boundary            | Required agreement                                                                                                          | Owners                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Portable timeline   | Versioning, initialized marker, mode/duration/FPS, interval and end-inheritance semantics, groups/masks and migration.      | Core + integration               |
| Property address    | Stable layer/effect/property identity, value kinds, ranges, arming/auto-key rules, incoming easing and base-value behavior. | Core + inspector + timeline      |
| Authoring edits     | Commands, gesture draft ownership, time/revision/selection capture, cancel and single undo.                                 | Core + inspector + interaction   |
| Evaluation          | Explicit canonical time, compiled inputs, effective properties/frame plan, clip-local source mapping and boundary rounding. | Core + runtime + render + export |
| Media source        | Original binary identity, frame request/revision, PTS/size/orientation/color, source lifecycle and stale generations.       | Media + render                   |
| Transport           | One active artboard, retained local playhead, playback/audio clock anchors and imperative subscribers.                      | Runtime + UI + audio             |
| Scrub/proxy         | Newest-seek arbitration, backward cache/decoder bounds, proxy triggers/progress/cancel/storage, original export invariants. | Media + performance + UX         |
| Audio               | Source trim/offset, volume representation/mute, overlap mix, output duration/capability and cancellation.                   | Media/audio + export             |
| Export              | Frame count/rational FPS, exact sample requests, GPU consumer ownership, Mediabunny A/V mux/backpressure.                   | Core + render + media + export   |
| Shared editor shell | Layout/toggle/zoom relocation, timeline open state, keyboard/focus, Timelapse relocation.                                   | Integration + UI                 |

Do not publish an interface merely because one agent needs it. Write the contract and notify affected owners; one designated owner edits shared barrels/model files. Changes that cross ownership boundaries are coordinated before mutation.

## Suggested implementation ownership

| Domain               | Initial tasks | Boundary                                                                                                                                         |
| -------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Core temporal engine | T01–T03       | Pure TypeScript generic/headless schema/validation/commands/property registry/evaluation/easing and exact mirrors.                               |
| Media/storage/render | T04, T05, T07 | Bounded original/proxy media, native decoders, frame providers and GPU dependencies; no editor UI ownership.                                     |
| Runtime/authoring UI | T06, T08–T11  | Transport, virtualized timeline, inspector key controls and direct manipulation; no alternative time model.                                      |
| Audio/export         | T12, T13      | Exact A/V sample placement, mute/volume/mix, original media and Mediabunny.                                                                      |
| Platform integration | T14, T15, T18 | Portable media/history/clipboard, simplified Timelapse export and headless adapters; camera is user-deferred until video/timeline stabilization. |
| Verification/audit   | T16, T17      | Independent native correctness, resource/performance cohorts and domain reviews.                                                                 |

There are four concurrent agent slots including root. Use at most three active subagents, each with a disjoint file/domain assignment. Reuse idle agents for the next dependency wave. Research, reading and edits can be parallel; heavy checks cannot.

## Claim and handoff procedure

1. Read the raw brief, mapped requirements, confirmed decisions, architecture/UX contracts and relevant repository docs.
2. Claim a T-ID with owned paths and dependency status. Note unresolved contracts before writing code; raise consequential product questions through root.
3. Implement one coherent milestone without unrelated root files, empty wrappers or duplicated document trees.
4. Add exact mirrored tests for executable sources. Use real native tests for rendering, video, audio, gestures, storage and decoded export behavior; mocks establish contracts only.
5. Request a heavy-check slot before starting expensive tests/builds/profiles. Record exact commands, scope and artifacts; stop an unsuitable experiment once understood.
6. Report files/contracts/behavior/errors/cleanup/tests/measurements and unresolved limits. Root reviews the actual diff and cross-domain effects.
7. A different agent audits the completed domain. Fix findings and rerun affected checks; keep failed raw evidence.
8. Require zero rule violations, a scoped changelog entry and deliberate staging before a milestone commit on the feature branch. No main merge/push is implied.

## Proof required for a completed task

| Claim                                  | Minimum evidence                                                                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model/commands work                    | Exact value/boundary/validation/transaction/undo/redo/migration tests, not only type acceptance.                                                                                                  |
| UI behaves like the reference          | Actual native pointer/keyboard scenarios and screenshots tied to the parity matrix; all visible controls functional.                                                                              |
| Video/effects work                     | Genuine decoded media frames and rendered/output pixels with source timestamps and actual backend identified.                                                                                     |
| Scrub is responsive                    | Generated/captured input, playhead feedback and correct-frame presentation measured separately; cold/warm/reversing/random source cases retained.                                                 |
| Export is deterministic                | Fixed output timestamps, correct original samples/effective values, native decoded output and A/V timing; distinguish GPU/codec portability from byte identity.                                   |
| Audio is preserved                     | Source audio, trim/mix/mute/volume and synchronized decoded output; no implicit silent fallback.                                                                                                  |
| Engine is generic and headless-capable | Real no-DOM author/evaluate imports, tested supported runtimes, UI/headless matched results and shared media/GPU/Mediabunny adapters. No duplicate evaluator or effect-specific animation switch. |
| Code remains readable                  | Independent review of responsibility boundaries, typed contracts, clear invariants, lifecycle ownership and concise public entry points.                                                          |
| Work is bounded                        | Actual decoder/frame/worker/GPU/cache/URL/PCM/storage counters before, during, after replacement and disposal.                                                                                    |
| No editor rerender flood               | Actual App, Inspector, CanvasArea, EditorCanvas and EditorScene React commit counts during held gestures/playback/scrub.                                                                          |
| Performance improved                   | Matched frozen builds, same workload/environment/boundary, raw distributions and original failures.                                                                                               |

## Milestone log

| Milestone                                  | State                | Evidence                                                                                                                                |
| ------------------------------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Isolated branch/worktree and 6110          | Verified preparation | Worktree at base `7ae8814`, frozen dependency install, CLI bound to 6110, HTTP 200.                                                     |
| Verbatim brief and supplied references     | Verified preparation | M1–M43, unchanged Figma references and later MusArt defect screenshots.                                                                 |
| Primary research and requirement contracts | Verified preparation | Agent-owned docs and source-linked acceptance matrices.                                                                                 |
| Claimable build plan                       | Verified preparation | T00–T21 with owners, dependencies, requirements and evidence.                                                                           |
| Production Motion/video source             | Active               | Core, transport, timeline/authoring and media-provider milestones are recorded separately.                                              |
| Motion performance/export proof            | Partial diagnostics  | Core-only distributions and a Timelapse native witness exist; integrated Motion-video export and browser performance remain unverified. |
