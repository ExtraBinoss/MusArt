# Motion and video: research and delivery map

MusArt will keep its existing layered composition workflow while adding time to individual artboards: video sources, animatable properties, persistent per-artboard timelines, precise trimming and deterministic export. Camera/live capture follows after video and the timeline stabilize. The current edit-history replay remains a separate Timelapse feature.

This directory preserves the user's request and the evidence used to plan the work. Research, proposed contracts and implementation results are kept distinct. No visual or performance parity is claimed merely because a requirement or test has been written.

| Document                                                        | Purpose                                                                                          |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [Verbatim brief](user-brief.fr.md)                              | Every user message in the Motion discussion, unchanged, with the two supplied screenshots.       |
| [Requirements](requirements.md)                                 | Stable requirement IDs, acceptance criteria and links back to the brief.                         |
| [Figma reference](figma-reference.md)                           | Primary Figma sources, verified interactions and screenshot observations.                        |
| [UI and UX specification](ui-ux-spec.md)                        | The intended MusArt workflow, visual structure and interaction rules.                            |
| [Architecture](architecture.md)                                 | Portable temporal model, evaluation, media adapters, composition, storage and export boundaries. |
| [Performance and verification](performance-and-verification.md) | Workloads, measurement boundaries, proposed budgets and failure/cleanup checks.                  |
| [Decisions and open questions](decisions-and-open-questions.md) | User choices, engineering proposals and remaining ambiguities.                                   |
| [Build checklist](build-checklist.md)                           | Sequenced tasks, dependencies, agent ownership and required evidence.                            |
| [Agent handoff](agent-handoff.md)                               | Delegation protocol, shared contracts and the current handoff state.                             |

## Isolated workspace

| Setting          | Value                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| Branch           | `feat/motion-video`                                                                                      |
| Worktree         | `/home/albi/Documents/Projects/Hackaton/MuseArtWeb-motion`                                               |
| Starting commit  | `7ae8814` — includes the verified first-visit onboarding                                                 |
| Development port | `6110`                                                                                                   |
| Main workspace   | `/home/albi/Documents/Projects/Hackaton/MuseArtWeb` — preserve its uncommitted work and server on `6100` |
| References       | [Overview](assets/figma-motion-overview.png), [timeline detail](assets/figma-motion-tracks.png)          |

Start this branch with `bun run dev -- --port 6110 --strictPort`. Use a separately frozen production build and another owned port for final profiling; HMR is not a performance baseline. Keep generated reports, recordings and captures under ignored `artifacts/`.

## Non-negotiable behavior

- An artboard owns its mode and its timeline. Switching artboards does not exchange or merge their tracks.
- First Motion activation adopts existing layers once across the composition duration. Returning from Static preserves prior timing and keyframes. More than three affected items requires a counted confirmation.
- A video import activates Motion through the same validated transition. Cancellation cannot leave a half-imported video or half-converted composition.
- The existing layer hierarchy remains authoritative for compositing. Temporal visibility and keyframe tracks refer to durable layer/effect identities rather than creating a second document tree.
- Inspector diamonds establish animation; later edits at other times create the next keyframe for that property. Global auto-keyframe is an explicit separate interaction.
- Static displays and edits the base design while preserving dormant animation. Only the active composition plays. Longer imported video extends the composition without shortening existing tracks.
- Playback, seeking and export share explicit temporal evaluation. User edits are undoable gestures; playing and scrubbing do not write per-frame document history.
- One generic, readable animation/keyframe engine powers the editor and headless use. Pure authoring/evaluation has no DOM, React, storage or GPU dependency; platform adapters handle media and rendering through the same export pipeline.
- Mediabunny manages export from original media. Automatic local preview proxies support responsive forward, backward and random scrubbing. Source-video audio includes per-track mute and volume.
- Export's split-button menu opens a simple Timelapse dialog with preview and a final duration of 1–30 seconds; the full creation replay is automatically retimed. This limit does not cap Motion exports.
- Performance targets must be measured on declared workloads, devices and backends. A 16 ms target is a frame-time budget, not a guarantee for arbitrary media, layer counts or hardware.

## Preparation status

The isolated worktree and 6110 server are ready. Three agents researched UX, architecture/performance and requirement completeness. The source brief preserves M1–M19, including all eight answered questions; 56 stable requirement/guardrail IDs map to acceptance criteria and the T00–T18 build plan. Research distinguishes verified Figma behavior, screenshot observations, MusArt adaptations and engineering proposals.

This milestone delivers research and preparation. Production Motion/video code is not implemented, and its performance/export checks have not run. Final integration contracts listed in T00 must be settled before dependent source changes. The main worktree and its 6100 server remain outside this branch's changes.
