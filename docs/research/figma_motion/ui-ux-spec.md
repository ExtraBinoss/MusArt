# Motion authoring: UI and UX specification

This is the intended MusArt experience, prepared before implementation. The [verbatim brief](user-brief.fr.md) is authoritative for user requests; the [Figma reference](figma-reference.md) separates verified reference interactions from screenshot observations. **Required** means directly requested or imposed by repository contracts. **Proposed** means an engineering/UI choice to make that request concrete; unresolved choices are called out explicitly.

## Product model and state

An artboard remains the composition boundary inside the infinite workspace. Its existing layers remain the compositing stack: images, video and other supported layer content can overlap, use effects and masks, and have independent active intervals. Time is an additional property of that composition, not a replacement document tree.

| Concept                 | Required behavior                                                                      | Scope                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Composition mode        | Static or Motion; switch either way at any time.                                       | Per artboard, not global workspace.                                                      |
| Timeline                | One independently stored timeline per artboard.                                        | Multiple artboards therefore support multiple timelines.                                 |
| Layer identity          | Canvas, layer tree, inspector and timeline refer to the same durable layer/effect IDs. | No cloned artwork on conversion.                                                         |
| First initialization    | Adopt existing affected items once over the complete composition duration.             | A persisted initialization state survives empty/deleted tracks.                          |
| Confirmation            | More than three affected items requires a counted Yes/No choice.                       | Three does not trigger it; four does.                                                    |
| Subsequent mode changes | Preserve durations, intervals, trims, keys and easing.                                 | Never rerun first initialization.                                                        |
| Video import            | Activate Motion on the destination artboard.                                           | Share the validated transition and its cancellation rules.                               |
| Export                  | Use Mediabunny for the requested deterministic video export path.                      | Preserve the same evaluated composition and original-source fidelity.                    |
| Existing Animate action | Put Timelapse in Export's split-button dropdown, opened by a small down-chevron.       | Open a simple creation-replay dialog; keep history replay distinct from Motion playback. |

### Mode-transition outcomes

| Starting state                                | Action                   | Required outcome                                                                                                             |
| --------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Static, never initialized, 0–3 affected items | Choose Motion            | Initialize once, reveal the timeline and retain the existing visual layer arrangement.                                       |
| Static, never initialized, >3 affected items  | Choose Motion            | Show counted confirmation before mutating the composition. Accept initializes; cancel leaves the artboard unchanged.         |
| Motion, initialized                           | Choose Static            | Show and edit the authored base design; stop temporal playback and retain dormant animation without baking the current pose. |
| Static, already initialized                   | Choose Motion            | Restore that artboard's existing timeline without resetting any timing or keys.                                              |
| Any destination artboard                      | Import a supported video | Resolve required conversion and asset preparation together; a canceled conversion cannot leave a partially added video.      |
| Artboard A selected                           | Select artboard B        | Show B's mode and timeline state. A's tracks are not moved, merged or reinitialized.                                         |
| Initialized artboard with every track removed | Return to Motion         | Keep it initialized; do not enroll all layers again by guessing from an empty track list.                                    |

**Proposed confirmation copy**, localized through English/French resources:

| Element          | English                                                                          | French                                                                                |
| ---------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Title            | Enable Motion?                                                                   | Activer Motion ?                                                                      |
| Message          | `{count} items will be added to the timeline for the full composition duration.` | `{count} éléments seront ajoutés à la timeline sur toute la durée de la composition.` |
| Primary / cancel | Yes, enable Motion / No, keep Static                                             | Oui, activer Motion / Non, garder le mode statique                                    |

The user confirmed that the count includes **every tracked layer, including groups and all their descendants**, and excludes effect/property rows. Derive it from the exact initialization plan used by the command. A group plus two child layers is three items; adding another tracked layer makes four and requires confirmation. Explain the inclusion of grouped children clearly in the dialog rather than counting only top-level rows.

### Confirmed product decisions

The user explicitly resolved these follow-up choices. They supersede earlier open questions; none is a tentative engineering default. All questions already asked of the user have answers; remaining engineering details below are not unanswered product prompts.

| Decision            | Required behavior                                                                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static design       | Display and edit base values while animation remains dormant and preserved. Do not bake the current animated pose into those base values.                                   |
| Preview media       | Prepare local playback proxies automatically when needed. Preserve original assets and always export from originals through Mediabunny.                                     |
| First-version audio | Include source-video audio with per-track Mute and Volume. Separate imported audio tracks are outside the selected initial audio scope.                                     |
| Active composition  | Only the active composition plays. Other compositions remain frozen; switching active artboards must stop their prior playback/audio clocks.                                |
| Longer video import | Extend composition duration when the imported video's placed visible range requires it. Never shorten existing tracks to fit the import.                                    |
| Counted conversion  | Count groups and descendants as tracked layers; exclude effect/property rows. Apply the >3 threshold to this same set.                                                      |
| Camera sequencing   | Defer camera/live capture to the next step after video and timeline are stabilized.                                                                                         |
| Timelapse entry     | Use an Export split button with a small down-chevron; its dropdown action opens a simple Timelapse dialog.                                                                  |
| Timelapse duration  | Let the user choose a final video duration from 1 to 30 seconds; automatically speed up or slow down the full creation replay to fit. This limit applies only to Timelapse. |
| Generic engine      | Keep UI as adapters over typed engine/registry contracts; animation/effect implementation belongs outside components and remains usable headlessly.                         |

Static base edits must remain distinct from Motion edits to an existing key. Returning to Motion evaluates the retained tracks against the updated base design under the documented temporal model; an edit must never silently erase or relocate keys.

## Workspace structure

| Region               | Intended MusArt behavior                                                                                                                          | Status                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Artboard controls    | Place Static/Motion **below its artboard**. Collapse readable labels to two recognizable icons at low zoom; preserve usable overlay target sizes. | Explicit M23/M28 refinement, replacing the earlier proposed placement.               |
| Bottom panel         | Motion reveals a docked timeline across the editor width, with hierarchy gutter, control strip, ruler and tracks.                                 | Required appearance target, informed by supplied reference.                          |
| Bottom-right control | Replace the current Recenter button with a timeline open/collapse toggle in Motion. Preserve the open state without changing the document.        | Required.                                                                            |
| Canvas zoom          | Move +/− to the top-right with Design-related controls. Keep canvas percentage/100% and Fit reachable.                                            | Relocation required; repository mandates zoom/reset/fit access.                      |
| Temporal zoom        | Keep timeline scale controls inside the timeline.                                                                                                 | Proposed to avoid ambiguity with canvas zoom.                                        |
| Panel height         | Resize from the top boundary; use the same neutral divider treatment as Layers/Properties, per M25. Keep a usable canvas viewport.                | M25 supersedes M23's tentative blue resize bar.                                      |
| Inspector            | Put keyframe diamonds beside supported properties and effect parameters.                                                                          | Required.                                                                            |
| Timelapse            | Place the Timelapse action in the dropdown of an Export split button, reached with its small down-chevron.                                        | Confirmed user placement; open the simple 1–30-second replay dialog described below. |

### Export split button and Timelapse

| Part                | Required behavior                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Primary segment     | Keep the normal Export action clearly labeled and independently clickable.                                                                                               |
| Secondary segment   | Show a small down-chevron as the compact adjacent dropdown trigger; label it accessibly as export options.                                                               |
| Dropdown action     | A clearly named `Export timelapse…` item opens the simple creation-replay dialog. Opening the menu alone must not start an export.                                       |
| Feature distinction | Timelapse replays edit history; Motion exports authored composition time. Menu copy must keep the distinction understandable.                                            |
| Keyboard/focus      | Both segments are focusable. Menu navigation, Escape dismissal and focus return follow Radix behavior; neither segment steals timeline shortcuts while its menu is open. |
| Failure/empty state | Honor the existing history/export capability and errors. Explain unavailable Timelapse without simulating a successful export.                                           |

Use genuine shadcn/Radix primitives and the reusable replay/export engine. Do not clone the old Animate panel with all of its controls into this dialog. Keep the primary Export action available for normal composition exports, including Motion exports longer than 30 seconds.

### Simple Timelapse dialog

The user wants to replay the creation journey and select its **final video length**, not manually adjust replay speed or configure the old Animate feature set. The duration setting automatically maps the complete replay to the chosen output length in both preview and export.

| Element or rule          | Required behavior / clearly labeled proposal                                                                                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dialog scope             | Simple `Timelapse` dialog reached from Export, using the creation history. Do not turn it into the authored Motion timeline or the old Animate panel.                                                          |
| Duration control         | `Final video duration`, with seconds visible; accepted output duration is 1–30 seconds inclusive. Never apply this range to composition timelines or ordinary Motion export.                                   |
| Proposed default         | Start at **10 seconds**, with whole-second input steps as a proposed initial UI choice. Neither default nor input precision was selected by the user; keep them documented, localized implementation defaults. |
| Speed                    | Calculate speed from the selected final duration. A short journey can slow down and a long journey can speed up; never truncate the journey to satisfy the duration.                                           |
| Full replay              | Preserve canonical creation-event order, meaningful beginning/end states and the existing replay engine's reconstruction rules. Duration scaling is an output-time mapping, not a journal rewrite.             |
| Preview                  | Compact inline preview with Play/Pause and replay progress; it uses the same duration mapping as export. Preview is a proposed usability aid, not a request for the old panel's full settings.                 |
| Actions                  | `Export video` starts the actual Timelapse export; `Cancel` closes without changing artwork, history, Motion duration or keyframes.                                                                            |
| Validation               | During editing, allow an incomplete field without exporting it. Reject nonfinite, blank, below-1 or above-30 committed values with a clear message; do not silently export a different duration.               |
| Empty or invalid history | Reject empty/unavailable replay with an explanation; do not simulate creation or a completed export. Validate replay availability independently of the selected output length.                                 |
| Progress/errors          | Report real preparation/export progress and failures. Cancel before completion stops the task and releases preview/export resources; do not present an unfinished output as a saved video.                     |
| Close/focus              | Escape/close follows modal rules, returns focus to Export and releases preview playback. If export is already running, use the same explicit cancel operation rather than hiding a continuing task.            |

Preview and export share the [architecture's proposed endpoint-inclusive sample contract](architecture.md#simple-timelapse-export-separate-time-mapping). Output timestamps and history evaluation times are distinct:

| Symbol / boundary        | Shared proposed rule                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `D`                      | Selected final output duration, finite and within 1–30 seconds inclusive.                                                                                                      |
| `J`                      | Canonical frozen replay span, in history-relative time. Reading it must not rewrite history timestamps.                                                                        |
| `N`                      | Output frame count `ceil(D × fps)`. Endpoint-inclusive replay requires `N ≥ 2`.                                                                                                |
| `n`                      | Output frame index from `0` through `N − 1`; its output timestamp is `n / fps`.                                                                                                |
| History sample           | Evaluate `historyTime(n) = J × n / (N − 1)`. The first frame includes the initial recorded state; the last includes the final recorded state.                                  |
| File end                 | Give the last sample duration `D − (N − 1) / fps`, so the file ends at `D` within the encoder/container timebase. Do not let frame-rate metadata round it past the chosen end. |
| Preview                  | Use this same sample/grid mapping, including first/final states and the final sample's hold to `D`; do not use an independent continuous `J × t / D` mapping.                  |
| `N = 1` or fewer         | Reject the unsupported duration/FPS pair with a useful error. Do not silently raise the frame count, divide by zero or lengthen the output.                                    |
| Empty/unavailable replay | Reject truthfully before export; no fabricated intermediate states or success result. A zero span alone must not bypass the replay engine's availability checks.               |

The engine owns sample-grid conversion and rounding; the dialog only supplies the chosen duration and displays its results. Compare preview and decoded export at the **same output frame index**, not by assuming their normalized wall-clock fraction is also the history fraction. This endpoint-compression rule is specific to Timelapse; ordinary Motion retains its authored half-open time evaluation.

### Visual adaptation targets

The goal is the supplied reference's compact, aligned motion-editor structure while preserving MusArt's theme, genuine shadcn/Radix controls and unchanged brand colors. The dimensions below are **proposed MusArt starting values**, not extracted Figma design tokens.

| Element             | Proposed starting value or treatment                                                  | Verification                                                                    |
| ------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Expanded panel      | About 300–340 CSS px on a normal desktop; height constrained by the available editor. | Compare against the reference at an agreed viewport; test short windows.        |
| Hierarchy gutter    | Align with the existing left layer sidebar; allow bounded resize if necessary.        | Labels and property rows must align with tracks while scrolling.                |
| Layer/property rows | 26/24 CSS px; bars visually slimmer within the row.                                   | Compact density with usable pointer targets and visible focus.                  |
| Controls/ruler      | Separate compact strip and readable ruler; stable widths for time values.             | Digits must not shift controls during playback.                                 |
| Selection           | Subtle full-row tint, stronger selected bar, filled selected diamonds.                | Contrast, high-contrast mode and non-color state cues.                          |
| Temporal marks      | Thin connectors, small diamond glyphs, clear playhead line/handle.                    | Expanded invisible hit area without overlapping ambiguous targets.              |
| Density             | Quiet separators, restrained rounding, short tooltips and minimal ornament.           | No visual competition with artwork.                                             |
| Panel motion        | Brief eased dock/collapse transition; reduced-motion support.                         | No canvas resize loop, delayed interaction or expensive per-frame React layout. |

Do not bake the overview screenshot's approximate 38% timeline height or 500 ms tick spacing into layout. They represent one capture and zoom state.

## Timeline controls and hierarchy

| Area                  | Controls or behavior                                                                              | Basis                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Leading control strip | Play/Pause, Auto-keyframe, current time, composition duration and unit.                           | Proposed adoption of Figma T2; current time and duration must remain distinct.     |
| Playback options      | Loop, Once and Ping-pong are the reference parity target.                                         | Define and test media/audio boundary behavior before exposing a supported control. |
| Right controls        | Temporal zoom slider and collapse control.                                                        | Figma T4 parity target.                                                            |
| Layer gutter          | Expand/collapse group and property rows; retain document names/order/selection.                   | User's retained layer model and screenshot hierarchy.                              |
| Hierarchy controls    | Distinguish individual row expansion, collapse/expand-all layers and collapsing the entire panel. | Complete reference-control inventory; do not conflate three different actions.     |
| Property rows         | Show animated properties beneath their owner, including effect instance/parameter identity.       | Required keyframe discoverability.                                                 |
| Layer bar             | Make active start/end and selection clear; distinguish media content from property curves.        | User's multi-track/trim request.                                                   |
| Time ruler            | Drag/seek with explicit current time; adapt tick density to zoom and prevent label collisions.    | Proposed interaction contract.                                                     |
| Empty state           | Explain how to add content and use an inspector diamond without covering artwork.                 | Proposed.                                                                          |

Expanding or collapsing rows, scrolling, zooming, changing panel height and moving the playhead are presentation actions. They do not create document undo entries. Selecting in the canvas/tree/timeline synchronizes the existing selection model; property-key selection can add a temporal editing scope without manufacturing duplicate layers.

### Track, source and keyframe operations

Figma's verified T5 is animation-duration editing. MusArt also needs genuine media trimming, so the operations below must remain distinguishable. Modifier assignments and whether stretch is included in the first milestone remain open.

| Operation                   | Intended result                                                                                                       | Must not accidentally do                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Move interval               | Shift the layer's active range; move associated local animation coherently under the chosen time-coordinate contract. | Change video source in-point or stretch media.               |
| Trim start/end              | Change the visible interval and corresponding media source range with exact bounds.                                   | Rescale property animation or playback speed invisibly.      |
| Stretch animation           | Explicitly retime a selected animation range.                                                                         | Masquerade as an ordinary media trim.                        |
| Move keyframes              | Change selected key times while preserving their values and the validated ordering/collision rules.                   | Create new layers or modify unrelated properties.            |
| Change composition duration | Edit the artboard's temporal boundary.                                                                                | Silently erase out-of-range keys or alter every media speed. |
| Reorder layers              | Use the authoritative layer-tree order for compositing.                                                               | Imply that horizontal timing changes the z-order.            |

During a valid gesture, show lightweight time/range feedback. Invalid media bounds or unsupported operations need clear disabled feedback. Commit once on completion; Escape or pointer cancellation restores the original values. Near an edge, bounded auto-scroll must retain the grabbed target and stop on cancel/unmount.

When a longer imported video requires a later composition endpoint, extend the duration through the same atomic import transaction. Preserve every existing layer's authored timing and keys without shortening or rescaling tracks. The imported video's placement and first-ever enrollment plan must agree on the resulting composition duration.

## Inspector and keyframe workflow

The directly requested workflow is: select an object, click its property diamond at the desired start time, advance the playhead, then edit the value to establish the next key. Existing effects stay applied throughout the layer's active frames; an effect needs keys only when its values change over time.

| Property state                           | Intended editing behavior                                                                                         | Status                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Not animated; Auto-keyframe off          | Ordinary value edit changes the base property. Diamond begins animation at the current time.                      | Required first-key entry; base edit rule proposed. |
| Already animated; no key at current time | Editing creates a key for that property.                                                                          | Required by the user.                              |
| Key exists at current time               | Editing updates that key rather than adding a duplicate.                                                          | Proposed invariant.                                |
| Auto-keyframe on                         | An eligible edit can establish animation without the initial diamond. Prominent recording feedback stays visible. | Separate opt-in Figma-style mode.                  |
| Several selected objects                 | Show mixed values and an explicit common-property scope.                                                          | Proposed; exact mixed editing behavior open.       |
| Unsupported value                        | Explain why a parameter cannot be keyed and provide a meaningful alternative where possible.                      | Required honest UI; capability inventory needed.   |

Use one property-capability description to drive inspector diamonds and track labels. The effect owner defines its interpolated values, validation limits and discrete switches; UI components should not maintain a divergent list.

UI modules are adapters over generic, readable engine contracts. Property fields, diamonds and timeline rows submit typed commands and consume registry/evaluation results; they do not implement easing, media scheduling, effect math or replay algorithms with component-local switches. Headless consumers must be able to use the same engine without React or browser UI dependencies.

| Value category                    | Proposed animation behavior                                                                  | UX implication                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Numbers/vectors                   | Interpolate supported components with documented units and bounds.                           | Uniform value editing and sensible constraints.                        |
| Colors                            | Explicit, consistent color-space/alpha interpolation.                                        | Avoid unexpected intermediate colors; architecture defines the space.  |
| Boolean/enum                      | Discrete change at a defined boundary.                                                       | Show step behavior, not a misleading smooth curve.                     |
| Procedural phase/time             | Evaluate from composition time and stable parameters.                                        | Distinguish continuous effect motion from keyframing a static setting. |
| Asset references, topology, seeds | Inventory each capability; support discrete changes only where deterministic and meaningful. | Do not invent numeric interpolation for arbitrary identifiers.         |

Use Figma reference K3–K7 as the selection/easing interaction target, with explicit focus guards and one undoable gesture. The previous/next-key controls seen in the crop are a useful proposal: they should seek within the current property, expose accessible names and disable when no target exists. Their behavior is not independently verified from the screenshot.

## Easing editor

Clicking a segment should reveal a compact editor near the selection. The property and segment times remain identifiable; closing a popover must not lose the selected keys. Use the Figma E1/E2 family list as the visual/control target, with deterministic MusArt algorithms rather than assumed numeric equivalence to Figma's internals.

**Proposed convention:** store easing on the destination key, label the edited transition as incoming, and make Hold retain the prior value until that key's timestamp. The [reference discrepancy](figma-reference.md#easing-and-model-details) makes boundary tests essential. Discrete properties use the defined step behavior regardless of a decorative curve preview.

Custom input must validate curve/spring parameters, retain the previous valid value on failure and expose the same result while seeking backward, forward or exporting out of order. Dragging curve handles previews imperatively and commits once; cancel restores the original curve.

## Media preparation and source audio

| Concern                     | Required outcome or proposed presentation                                                                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automatic local preparation | Generate playback proxies only when needed under a bounded policy. Keep original source references intact and preserve deterministic source-time mapping.                                           |
| Preparation feedback        | Proposed non-blocking item status: `Preparing smooth playback…`, with progress only when measurable. Distinguish preparing, ready, canceled and failed; do not fabricate a percentage or readiness. |
| Cancellation                | Cancel preparation without losing imported source content or temporal edits. Use source preview where supported and report its true readiness; do not present unavailable proxy playback as ready.  |
| Scrub during preparation    | Keep requested time authoritative and responsive; show a truthful frame-pending state when the requested sample is not available.                                                                   |
| Preview versus export       | A preview optimization must never lower the final original-source export quality. Export errors remain real failures.                                                                               |
| Source-audio controls       | Each video track with usable audio exposes Mute and Volume, with clear muted and unavailable states. A silent video is valid.                                                                       |
| Audio timing                | Source audio follows the same clip interval, source in/out and supported playback-time mapping as its video. Trimming cannot desynchronize it.                                                      |
| Audio ownership             | Keep source audio attached to its video identity in the initial version. Do not add an unrelated audio-import workflow under this scope.                                                            |
| Audio verification          | Preview and decoded export must agree on trim boundaries, mute and gain. Decide numeric gain units/range explicitly; validate clipping and seek/pause cleanup.                                      |

Use compact track or inspector controls so audio does not obscure property animation rows. Screen-reader labels must identify the owning track. If gain or mute becomes keyframeable, advertise only the implemented, deterministic capability rather than showing inert diamonds.

## Playback, focus and accessibility

| Concern                  | Intended contract                                                                                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clock                    | The displayed timestamp, evaluated properties and requested media frame share one explicit composition time. Pausing or scrubbing does not mutate the document each frame.                     |
| Seek                     | Show the last valid frame and a truthful loading state when preparation is incomplete; reject stale results after another seek/artboard switch.                                                |
| Immediate scrub feedback | The playhead and requested timestamp follow input immediately in either direction; a pending decoded frame must never be represented as the correct requested frame.                           |
| Rapid reversals          | Prioritize the newest seek, cancel or invalidate obsolete work, and bound preparation queues. A frame arriving late cannot overwrite a newer result.                                           |
| Endpoints                | Define exact start/end inclusion, stopping and loop boundaries in the temporal model; UI must display those same semantics.                                                                    |
| Multiple artboards       | Only the active composition plays; others remain frozen. Switching stops the old composition's clock and audio, invalidates pending playback results and restores the destination's own state. |
| Keyboard                 | Adopt the verified reference subset where compatible. Resolve Space playback versus existing Space-drag panning before assigning global handlers.                                              |
| Input focus              | Text fields, color editors, menus and modal dialogs retain their normal keys. Delete must target the focused temporal selection, not unexpectedly delete artwork.                              |
| Pointer domains          | Canvas wheel/pan/zoom and timeline pan/zoom act only in their own region. Canvas zoom must preserve pointer anchoring.                                                                         |
| Accessibility            | Real buttons, labeled sliders, visible focus, readable values, keyboard alternatives, screen-reader state and reduced-motion panel transitions. Do not rely on color alone.                    |
| Undo                     | A completed property, keyframe, range or easing gesture creates one command transaction. Playback, seek and view changes create none.                                                          |
| Cleanup                  | Close/cancel/switch releases capture, stops auto-scroll, rejects stale asynchronous work and unsubscribes preview listeners.                                                                   |

Smoothness must be measured, not inferred from animated UI. Scrubbing, playback and continuous property previews must use imperative subscriptions and bounded work rather than rerendering App, Inspector, CanvasArea, EditorCanvas or EditorScene per update. Compare a frozen production build, record actual React commits and use the performance protocol before claiming the requested sub-16 ms frame budget.

The user specifically asks for immediate, impressive forward/backward scrubbing and Mediabunny export. Separate input-to-playhead latency from requested-time-to-correct-frame latency in the evidence. Test cold and warm seeks, long-GOP media, rapid direction reversals and heavy effect stacks. Automatic preview proxies are confirmed, but preparation remains asynchronous: do not claim a stale frame is correct or lower original-source export quality to satisfy the latency target.

## Decisions to settle explicitly

These are not missing user permissions. They are unresolved details for the architecture/UX owners to decide, document and test without losing the stated requirements.

| ID     | Question                                                                            | Suggested direction, not an adopted requirement                                                                                                                                 |
| ------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UX-D1  | Resolved: what does Static display after a timeline exists?                         | User chose the editable base design; retain dormant animation and do not bake the current pose.                                                                                 |
| UX-D2  | Resolved: what is one counted item for first initialization?                        | Every tracked layer, including groups and descendants; effect/property rows are excluded.                                                                                       |
| UX-D3  | What duration is created initially before media establishes it?                     | Choose a MusArt default. Longer imported video extends the composition as needed without shortening existing tracks; that import rule is confirmed.                             |
| UX-D4  | How are new layers added in Static after initialization timed?                      | Enroll only new identities under an explicit rule; preserve all existing ranges and keys.                                                                                       |
| UX-D5  | Are key times artboard-local or clip-local, and how do trim/move affect them?       | Agree with the temporal model before implementing handles or inspector edits.                                                                                                   |
| UX-D6  | How does shortening the composition handle later content?                           | Preserve recoverable data and show clipped ranges; require a distinct destructive operation for deletion.                                                                       |
| UX-D7  | Which pointer/modifier means trim versus stretch or slip?                           | Ordinary media handles should have one predictable meaning, with labeled alternatives.                                                                                          |
| UX-D8  | How do group intervals constrain descendants and masks?                             | Preserve compositing dependencies; document parent/child interval evaluation.                                                                                                   |
| UX-D9  | What remains of Recenter outside the bottom-right button?                           | The user explicitly replaces that control; repository requires recenter availability. Keep a reachable command/menu entry.                                                      |
| UX-D10 | Resolved: where does Timelapse live and what does it expose?                        | Export split button with small down-chevron opens a simple creation-replay dialog; select 1–30 seconds and calculate replay speed automatically.                                |
| UX-D11 | Deferred: what happens during live-camera export?                                   | Camera is explicitly the next step after video/timeline stabilization. Retain the recorded-source deterministic boundary for that later task; do not claim camera delivery now. |
| UX-D12 | What is the initial frame/time display?                                             | Milliseconds fit the reference; frame stepping/timecode need an explicit frame-rate contract.                                                                                   |
| UX-D13 | How are automatic proxy need, readiness, eviction and cancellation defined?         | Product choice is confirmed; define the bounded technical policy and truthful progress/readiness behavior.                                                                      |
| UX-D14 | What gain unit/range and keyframe support apply to source audio?                    | Per-track Mute/Volume are confirmed; document these control details without expanding into separate audio tracks.                                                               |
| UX-D15 | How does Ping-pong handle source video/audio when the reference transport reverses? | Preserve the parity target, define exact reverse-time and audio behavior, and test it; unsupported reverse behavior must not be hidden behind a working-looking button.         |

## Acceptance scenarios

| ID     | Scenario                                                                                                                         | Observable pass condition                                                                                                                                                                                            |
| ------ | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UX-A1  | Activate Motion with three items, then repeat with four.                                                                         | Three initializes directly; four shows the correct count and accepting enrolls exactly that plan.                                                                                                                    |
| UX-A2  | Cancel counted conversion and cancel video-triggered conversion.                                                                 | No partial mode, track or media mutation; no extra undo entry or orphan resource.                                                                                                                                    |
| UX-A3  | Trim/rekey a layer, switch Static→Motion repeatedly, reload.                                                                     | IDs, keys, easing, trims and duration remain intact; no reenrollment dialog.                                                                                                                                         |
| UX-A4  | Remove all temporal tracks and toggle modes.                                                                                     | Initialization stays recorded and the empty timeline stays empty.                                                                                                                                                    |
| UX-A5  | Create two artboards, with a video and image overlay in one.                                                                     | Each has its own state; the overlay composites in the correct layer order and active time.                                                                                                                           |
| UX-A6  | Add a first key with the diamond, seek and edit; edit again at that same time.                                                   | A second key appears once; later edits update it without duplicates or base-state corruption.                                                                                                                        |
| UX-A7  | Enable/disable Auto-keyframe and edit an unanimated eligible property.                                                           | Recording is clearly indicated and affects only the documented mode.                                                                                                                                                 |
| UX-A8  | Select/move multiple keys, snap, delete and undo.                                                                                | Scope is clear, spacing/collision rules hold, and undo/cancel restore exact values.                                                                                                                                  |
| UX-A9  | Change every supported effect category over time.                                                                                | The effect remains applied; numeric/color/discrete behavior follows the capability contract.                                                                                                                         |
| UX-A10 | Edit Hold, custom Bézier and spring while seeking in both directions.                                                            | Boundaries and values are deterministic, including exact key timestamps.                                                                                                                                             |
| UX-A11 | Trim media, move it later and compare an overlapping image/text layer.                                                           | Source samples and compositing time agree; trim does not invisibly stretch animation or media speed.                                                                                                                 |
| UX-A12 | Resize/collapse timeline and use canvas/timeline zoom independently.                                                             | Controls remain reachable, hierarchy stays aligned and no document history is written.                                                                                                                               |
| UX-A13 | Use Space/Delete with timeline, canvas, text field and dialog focus.                                                             | Correct command fires without stealing input, deleting unrelated artwork or breaking pan.                                                                                                                            |
| UX-A14 | Scrub/play a declared heavy composition while profiling.                                                                         | Measured frame/gesture cost, decode queue, memory and React commits meet the documented workload budget.                                                                                                             |
| UX-A15 | Compare preview and decoded export at known timestamps.                                                                          | Same temporal evaluation and source-frame policy; errors surface truthfully.                                                                                                                                         |
| UX-A16 | Scrub rapidly forward/backward with cold and warm media, then switch artboards mid-seek.                                         | Immediate playhead feedback; only the newest correct frame is accepted; obsolete work remains bounded and cannot repaint another artboard.                                                                           |
| UX-A17 | Edit the base design in Static after creating Motion keys, then return to Motion.                                                | Base edits remain distinct; dormant curves, key times, trims and original values are preserved under the agreed evaluation rules.                                                                                    |
| UX-A18 | Trigger automatic local preparation, cancel it and retry.                                                                        | Progress is truthful, source content survives, resources are released and no stale completion changes a deleted or replaced asset.                                                                                   |
| UX-A19 | Trim a video with audio, mute/unmute it and change its volume; decode an export.                                                 | Audio remains synchronized, controls apply to the correct video and original-source export honors mute/gain.                                                                                                         |
| UX-A20 | Convert a group with two children, then the same tree plus another layer, with effect/property rows visible.                     | First case counts three; second counts four and confirms; effect/property rows never inflate the count.                                                                                                              |
| UX-A21 | Play composition A, then activate B while A has a pending decoded frame and audible source audio.                                | Only B advances; A freezes and is inaudible; A's late result cannot alter B or restart A.                                                                                                                            |
| UX-A22 | Import a longer video into an initialized composition with trimmed and keyed tracks.                                             | Duration extends to contain the new placed range; existing intervals, trims, keys and speeds are not shortened or rescaled.                                                                                          |
| UX-A23 | Use both segments of Export with pointer and keyboard, including menu Escape/cancel.                                             | Primary opens normal export; chevron opens options; Timelapse opens its simple dialog; dismissing the menu starts nothing and restores focus.                                                                        |
| UX-A24 | Set Timelapse duration to 1 and 30 seconds, then enter invalid/blank values; export a Motion composition longer than 30 seconds. | Valid Timelapse boundaries are accepted and decoded output matches the chosen duration under the documented frame rounding; invalid values cannot export; normal Motion export has no inherited 30-second limit.     |
| UX-A25 | Preview/export short and long creation journeys at the same selected duration.                                                   | Both follow the shared `D`, `N`, `n` mapping: matching output frame indices evaluate matching history time, first/final states are included, and decoded file duration ends at `D` under the shared timebase policy. |
| UX-A26 | Cancel the Timelapse dialog during preview and cancel an in-progress export.                                                     | Stop/release owned work without changing history, artwork or Motion metadata; restore focus; report no successful output for a canceled task.                                                                        |
| UX-A27 | Request empty/unavailable history or an unsupported duration/FPS pair with `N = 1` through the shared service/headless adapter.  | A clear rejection reaches the UI/caller; no divide-by-zero, fabricated creation, silent frame-count increase, output beyond `D` or success result.                                                                   |

## Tasks suitable for separate agent ownership

Integrate these into the shared [build checklist](build-checklist.md). Each task needs a stable model/API contract before UI and renderer work proceed in parallel.

- [ ] **Mode and conversion:** implement per-artboard state, groups-and-descendants initialization count, atomic conversion/import, duration extension, persistence and undo cases UX-A1–A5, UX-A20 and UX-A22.
- [ ] **Timeline shell:** deliver panel docking, controls, hierarchy, virtualized rows, synchronized view state and canvas-control relocation; verify UX-A12–A13.
- [ ] **Temporal gestures:** implement selection, snap, move/trim semantics, cancel/commit and bounded auto-scroll; verify UX-A8 and UX-A11.
- [ ] **Inspector and effects:** capability-driven diamonds, manual and Auto-keyframe modes, inline navigation and effect parameter tracks; verify UX-A6–A9.
- [ ] **Easing:** deterministic functions, curve editor, discrete boundaries, validation, undo and seek independence; verify UX-A10.
- [ ] **Media and playback integration:** explicit time requests, pending/error states, latest-seek prioritization, active-only playback/audio, artboard switching, source preparation and Mediabunny decoded-export comparison; verify UX-A5, UX-A11, UX-A15–A16 and UX-A21–A22.
- [ ] **Base-state editing and proxy preparation:** Static edits with dormant tracks, automatic local preparation, truthful progress/cancel/readiness and original-source preservation; verify UX-A17–A18.
- [ ] **Source audio:** per-video Mute/Volume controls, shared trim/time mapping, synchronized preview/export and cleanup; verify UX-A19.
- [ ] **Export navigation and simple Timelapse:** preserve normal export, add the small-chevron split dropdown, implement the simple final-duration dialog and shared endpoint-inclusive whole-journey sample mapping; verify UX-A23–A27. Do not clone the full Animate panel or impose Timelapse limits on Motion.
- [ ] **Deferred camera follow-up:** retain the documented live/recorded distinction and dependencies, but schedule camera implementation after video/timeline stabilization as explicitly requested.
- [ ] **Independent UX/performance audit:** reference comparison, focus/accessibility review, real browser gestures, measured React/GPU/media work and cleanup; verify UX-A12–A27, including generic engine/headless boundaries.

The preparation phase records these tasks; unchecked boxes are not claims of delivered functionality.
