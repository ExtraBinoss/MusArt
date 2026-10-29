# Motion and video architecture proposal

Research snapshot: **October 29, 2026**, based on `feat/motion-video` at `7ae8814`. This is a design proposal and implementation handoff, not a claim that Motion or video sources are implemented. The [user brief](user-brief.fr.md), [Figma research](figma-reference.md) and [UI/UX specification](ui-ux-spec.md) define the product requirements. Open decisions are listed explicitly below.

Subsequent product answers resolve these choices: **Static edits the authored base design; automatic local preview proxies are allowed when needed; video source audio is preserved with mute and volume per video track; Play advances only the active composition; a longer imported video extends duration without shortening existing tracks; first-population counts include groups and descendants.** Mediabunny is a **required export dependency**, and exports always use original media. Forward/backward scrubbing, including rapid direction reversals, is a separate critical interaction domain.

**Delivery boundary confirmed by the user:** stabilize file video, timeline, source audio and proxies first. Camera/live capture is an explicit next phase. Its source/lifecycle contract is retained below so future integration does not require redefining deterministic export; it is not a prerequisite for the first delivery. The existing Timelapse feature remains independent and is accessed from Export through a split button with a down-chevron dropdown. The main export action and “Export timelapse” must stay distinct; no project-menu relocation is planned. All questions already asked have explicit user answers; the technical decisions below are still labeled proposals.

M18/M19 add two explicit requirements: Timelapse export uses a **simple 1–30 second duration dialog with automatic full-history speed mapping**, and the entire authored-animation/keyframe engine is **generic, headless-capable and written as clean, readable modules**. Neither capability may depend on mounting the editor.

## Boundaries to preserve

| Owner               | New responsibility                                                                                                                      | Existing contract retained                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `packages/core`     | Portable timeline, typed tracks, exact time, evaluation, validation and validated editing commands.                                     | Pure TypeScript; no browser objects, GPU resources, storage or React.                                              |
| `packages/render`   | Reusable source preparation/frame leases, dynamic textures, GPU composition/caches, and adapter-driven Mediabunny export orchestration. | Three.js `WebGPURenderer`, TSL, genuine Three WebGL fallback and no production pixel readback.                     |
| `apps/web` services | File/camera acquisition, persistence, platform source/font/output resolvers, editor transport scheduling and UI integration.            | Durable IDs, atomic related writes, stale-result rejection, visible failures and explicit cleanup.                 |
| `apps/web` UI       | Per-artboard mode, inspector keyframe affordances, timeline gestures and accessible controls.                                           | Genuine shadcn/Radix; English/French resources; imperative gesture previews and one undo entry per completed edit. |

A timeline is another view of the canonical layer tree. It does not create a second independent set of layers. Each artboard owns its timeline; selecting another artboard selects that artboard's time and editing scope. The infinite workspace remains spatial navigation.

Reusable decoding/source preparation and export orchestration belong to `packages/render`, with injected original-media, font, capability and output-target adapters. `apps/web` supplies acquisition/persistence and editor-specific presentation; it does not own a second exporter. The existing app-level replay exporter is an audited migration seam, not an ownership rule for new Motion code. A headless browser host imports `@musart/core` and `@musart/render` directly; it must not import the editor, mount its React tree, access editor atoms or depend on `window.musart` to export.

## What exists and what must change

| Current source                                                                                                                                              | Verified existing behavior                                                                                      | Required seam                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [Document model](../../../packages/core/src/document/model.ts)                                                                                              | `Composition` has no mode, duration or timeline. `Asset` requires an image-oriented `dataUrl`.                  | Add backward-compatible optional Motion metadata and media descriptions; migrate persistence without embedding runtime handles.        |
| [Effect definitions](../../../packages/core/src/effects/definition.ts)                                                                                      | Typed numeric, boolean, choice and color metadata; bounds, steps, conditional visibility and stable effect IDs. | A typed animatable-property registry derived from these definitions, plus common layer/effect fields.                                  |
| [Replay evaluator](../../../packages/core/src/animation/evaluate.ts)                                                                                        | Replays completed edits; interpolates a limited set of geometry and effect values.                              | Keep as Timelapse. Introduce a separate authored-timeline evaluator rather than treating history events as keyframes.                  |
| [Playback source](../../../apps/web/src/canvas/session/playback-source.ts) and [scene controller](../../../apps/web/src/canvas/session/scene-controller.ts) | Existing imperative presentation path that avoids loading a project for every frame.                            | Feed evaluated Motion frames through an engine-scoped source with explicit precedence and origin checks.                               |
| [Texture sources](../../../packages/render/src/surface/TextureSources.ts)                                                                                   | Decodes immutable images and retains a GPU texture per original identity.                                       | Add dynamic source leases and per-source content revisions. Preserve the image fast path.                                              |
| [Source keys](../../../packages/render/src/cache/keys.ts)                                                                                                   | Keys include paint, masks, descendants and original identity, but no video frame identity.                      | Include a bounded dynamic revision in affected dependency closures, without hashing video bytes per frame.                             |
| [GPU cache](../../../packages/render/src/cache/GpuResourceCache.ts)                                                                                         | One hard-budget LRU, with frame-pinned resources; default budget is 384 MiB.                                    | Account for dynamic textures and retained processing targets; avoid retaining a complete processed entry for every playback timestamp. |
| [Video export](../../../apps/web/src/services/animation/export-video.ts)                                                                                    | A retained GPU canvas feeds Mediabunny at explicit output timestamps with encoder backpressure.                 | Migrate reusable output orchestration into packages/render; keep this app entry as a thin platform/UI adapter.                         |
| [Standalone session](../../../packages/render/src/export/standalone.ts)                                                                                     | One serial queue owns a retained renderer, compositor and asynchronous frame consumer.                          | Hold source-frame leases through actual consumption; never overwrite a borrowed canvas before its consumer settles.                    |

## Generic engine and headless contract

The animation engine is a reusable authoring/evaluation library, not a service hidden inside timeline components. Pure Bun/Node consumers must create and validate tracks, edit keys through commands, select easing, compile and evaluate any exact time without React, a DOM shim, GPU, storage, installed browser or running application. Rendering/encoding is a separate platform capability.

Requirement trace: **ENG-01**, **ENG-02**, the shared time/property requirements and **T18**. The public headless-capable API is mandatory; extending the convenience CLI with additional verbs is proposed.

| Surface                 | Proposed public contract                                                                                                                                 | Required invariant                                                                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authoring               | Typed timeline/key/easing commands through the existing validated engine/domain registry.                                                                | UI, scripts and CLI apply the same commands, transactions, stale checks and undo semantics.                                                                                  |
| Initialization planning | Pure first-population plan with counted durable IDs, duration changes and revision fingerprint.                                                          | Browser shows the required dialog. A noninteractive CLI either receives explicit acknowledgment of that same plan or reports confirmation required; it never fabricates Yes. |
| Property addressing     | Typed constructors for layer/common-effect/settings/paint targets; registry resolves validated descriptors.                                              | No unvalidated property strings or arbitrary object-path setters.                                                                                                            |
| Compilation             | `compileMotion(project, { compositionId, registry })` creates a retained program.                                                                        | One program per authored revision; no source preparation, media reads, clocks or UI state.                                                                                   |
| Evaluation              | `evaluateMotion(program, exactTime)` yields an effective frame plan and timed source requests.                                                           | Same result for repeated, backwards and random-order calls; no mutation of base document or history.                                                                         |
| Output timing           | Shared rational time/frame helpers and explicit interval/source mapping.                                                                                 | Browser export and headless export use the same frame indices, rounding, easing and source PTS requests.                                                                     |
| Extensions              | Typed property/easing/source-description contracts, composed from trusted domain-owned registries.                                                       | Extensible without renderer/inspector-specific branches in core; imported documents cannot supply executable code.                                                           |
| Serialization           | Existing parse/serialize validation extended for timeline metadata and binary media references.                                                          | No DOM/media handles in portable state; actual binary resolution stays in platform adapters.                                                                                 |
| Browser/CLI rendering   | A packages/render export API consumes the exact frame plan and injected source/font/output adapters, renders Three and encodes/muxes through Mediabunny. | Same source/effect/export behavior as interactive export, with progress, cancellation and actual capability errors.                                                          |

The following example defines a **proposed API shape only**. These names are not implemented exports. T00/T01/T18 must freeze the final names together; examples must become checked fixtures rather than drift from the public API.

```ts
import {
  EditorEngine,
  compileMotion,
  evaluateMotion,
  frameTime,
  layerProperty,
  motionCommands,
  parseProject,
  readMotionValue,
} from "@musart/core";

// The input contains an initialized composition and an existing "hero" layer.
const engine = new EditorEngine(parseProject(projectJson));
const target = layerProperty("hero", "x");

engine.transaction([
  motionCommands.upsertKeyframe({
    compositionId: "cover",
    target,
    time: { value: 0, rate: 1 },
    value: 0,
  }),
  motionCommands.upsertKeyframe({
    compositionId: "cover",
    target,
    time: { value: 1, rate: 1 },
    value: 120,
    incomingEasing: { type: "linear" },
  }),
]);

const program = compileMotion(engine.getSnapshot().project, {
  compositionId: "cover",
});
const frame = evaluateMotion(program, frameTime(15, { numerator: 30, denominator: 1 }));
console.log(readMotionValue(frame, target)); // 60 at half a second.
```

The engine only receives the caller's exact time. A pure evaluation report includes timed media requirements but does not open files or decode them. An optimized retained-buffer evaluator may share the same semantics, but must not expose mutable scratch buffers as durable snapshots or force consumers to clone a full project for every frame.

| Runtime               | Existing behavior and planned extension                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bun                   | [Current CLI](../../../scripts/headless.ts) already runs `create`/`apply` without a browser. Extend that same command path to Motion authoring and add pure timed evaluation/reporting.                                                     |
| Node                  | Current `@musart/core` package exports TypeScript source. Provide and smoke-test a supported Node-consumable entry/runtime; do not assume a Bun import test establishes Node compatibility. No browser globals or DOM shim may be needed.   |
| Real headless browser | Current CLI launches Chromium for still render/screenshot. Provide a reusable headless browser export adapter through packages/render, using the production evaluator, Three renderer and Mediabunny pipeline without importing the editor. |
| Existing 6110 app     | A proposed CLI browser adapter may connect explicitly to the isolated worktree server or a minimal export host. Do not change the 6100 default globally or rely on UI clicks/current selection to choose a composition/time.                |

Suggested CLI operation families are `apply` for authoring, `evaluate` for a JSON frame-plan/value report, `render-at-time` for a still, `export-motion` for authored video/audio, and `export-timelapse` for compressed history. They are proposals, not currently executable commands. Require explicit composition/input/output/time/FPS parameters as appropriate, nonzero exit codes for validation/codec/missing-media failures, progress separate from machine-readable output, cancellation, and cleanup of browsers/decoders/output targets. No server is needed for pure authoring/evaluation; GPU/media export requires a real capable browser adapter.

Readable code is an acceptance requirement: split `model`, `time`, `properties`, `commands`, `easing`, `compile`, `evaluate` and platform adapters by responsibility; keep public entry points short and names/domain units explicit. Avoid an oversized timeline component, parallel UI/core interpolation switches, opaque property mutation, empty wrappers and a generic abstraction that hides ownership. Domain-owned registries supply definitions; validation/evaluation dispatch through typed capabilities. Follow the existing 600-line rule, exact test mirrors and independent review. See [T18 and the build plan](build-checklist.md) and [the agent handoff](agent-handoff.md).

The rendering-side headless contract is separately injectable and editor-independent. An illustrative browser-host call is below; it is a proposed API, not an existing export. Original bytes arrive through a resolver, and the output target handles bounded writing rather than forcing the core to know files, IndexedDB or a download dialog.

```ts
import { compileMotion } from "@musart/core";
import { exportMotionVideo } from "@musart/render";

await exportMotionVideo({
  program: compileMotion(project, { compositionId }),
  originalMedia: host.originalMediaResolver,
  fonts: host.fontResolver,
  output: host.outputTarget,
  signal: host.abortSignal,
  onProgress: host.reportProgress,
});
```

Both the editor's thin export adapter and a minimal real headless browser host call this same implementation. No parallel headless renderer, native WebGPU engine, handwritten shader path or CLI-specific temporal evaluator is introduced. A headless consumer still receives truthful missing-media/font/codec/backend errors and owns cancellation/teardown through the declared session contract.

## Portable composition state

The following names are proposed contracts, not committed public API names.

| Field or record       | Rule                                                                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Composition mode      | `static` or `motion`. A missing field on an old document means Static.                                                                                               |
| Retained timeline     | Optional versioned metadata with duration, rational frame rate, layer timing and property tracks. Mode changes retain this record.                                   |
| Initialization marker | Persisted with the timeline, independent from mode. An empty initialized timeline is still initialized. Switching back to Motion must not re-run initial population. |
| Layer timing          | References the existing durable layer ID; an interval has a start and an explicit end or a semantic `composition-end` end.                                           |
| Property track        | References layer/effect/stable sub-property IDs, carries a registered value type and ordered keyframes.                                                              |
| Keyframe              | Stable ID, exact authored time, typed value and incoming easing. Duplicate times use a defined upsert operation, not ambiguous ordering.                             |
| Media description     | Stable asset ID, kind, MIME/container/codec metadata, byte length, dimensions, duration/time metadata and durable content revision.                                  |
| Video audio settings  | Retain source audio selection, per-video-track mute and volume with that clip. Video and its audio share the same placement/trim mapping.                            |
| Derived preview media | A replaceable local cache indexed by original revision and conversion settings; no proxy ID becomes the canonical export asset.                                      |
| Runtime media         | `File`, `Blob` leases, `MediaStream`, decoder, `VideoFrame`, Three textures and object URLs stay outside portable core records.                                      |

Image data and original portable files must remain readable. Video must not be added as a giant `dataUrl` inside every manifest, history event or worker message. A versioned portable package may carry a small document plus separately named binary originals. The exact new container and extension compatibility need a migration decision before implementation; do not silently change the meaning of existing `.musart` JSON files.

## Static/Motion transitions and first population

| Operation                        | Atomic behavior                                                                                                                                                                                                                                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First switch to Motion           | Capture the canonical artboard and count every layer that receives a timeline track, including group containers and descendants. Initialize the timeline once, giving existing items the entire composition interval.                                                                          |
| More than three items            | Show the translated count and explicit Yes/No choice before committing initialization. At three or fewer, the user requirement does not call for this confirmation.                                                                                                                            |
| Accept                           | Recheck project, artboard, revision and item set. Commit mode, timeline and initial timing in one transaction and one undo entry.                                                                                                                                                              |
| Cancel or stale confirmation     | Preserve the project, original bytes, mode and timeline. Release pending work. A response for a replaced artboard cannot initialize it.                                                                                                                                                        |
| Motion to Static                 | Retain intervals, tracks, keys, easing, initialization marker and media descriptions. Stop playback and release unneeded active decode work.                                                                                                                                                   |
| Static back to Motion            | Restore the retained timeline and existing edits. Do not show first-population confirmation again or reset existing durations.                                                                                                                                                                 |
| Add a layer after initialization | Create only that layer's timing atomically with the layer, including when the timeline is dormant in Static mode. Default to the entire composition unless an explicit insertion interval was chosen.                                                                                          |
| Import a video                   | Its committed destination artboard enters Motion automatically. Preflight required first-population confirmation before the atomic import/conversion; rejecting it cancels the staged operation. Extend duration as needed to include the placed video; never shorten/rescale existing tracks. |
| Extend duration                  | Items using `composition-end` grow with the composition. Explicitly trimmed end times stay explicit. Do not retime unrelated keys.                                                                                                                                                             |
| Duplicate/copy/paste/delete      | Remap or remove timing, property targets and keyframe IDs together with canonical layers, effects, groups and original references. No dangling tracks.                                                                                                                                         |

**Counting is resolved:** count every layer represented by a track, including groups and their descendants; exclude effect/property subrows. A mask source counts if it is an existing tracked layer, not an extra row for each mask relationship. A shared pure selector supplies the preview, confirmation and committed operation. Capture the sorted durable layer-ID set plus canonical revision as the confirmation fingerprint, not only the number; four replaced layers still require stale-result rejection even if the count remains four. Include the staged imported layer when it will receive a track so the stated count matches the complete committed operation.

Longer-media import computes the new duration from placement plus source duration and takes the maximum with the existing duration. Preserve explicit track trims, authored keys and existing timing. Proposed semantic `composition-end` intervals follow the enlarged end naturally; this is an engineering rule implementing whole-duration items, not permission to stretch explicitly timed tracks. Shorter imports never shrink the composition.

## Static evaluation and editing: resolved

The user selected authored **base design**. Static renders ordinary base properties, canonical layer visibility and the ordinary layer tree. Timeline intervals, animation keys and effect time progression are dormant, retained and excluded from Static evaluation. A video renders an explicitly stored poster/source time; selecting its default poster remains a small implementation decision.

Static property edits update base values without adding, moving or deleting dormant keys. Returning to Motion evaluates the retained tracks; an existing absolute key may therefore override a subsequently edited base value at that time. The inspector must make this understandable when switching modes. An untracked property continues to use its base value in Motion. No mode switch automatically bakes an evaluated pose into the base design.

## Exact time and interval contract

| Concern                | Proposed rule                                                                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Portable authored time | Canonical rational ticks (`value / rate`) with safe-integer numerators, positive bounded denominators and normalized representations. No serialized `BigInt`, `Date` or wall-clock timestamp.                   |
| Frame rate             | A rational pair such as `30000 / 1001`, rather than a rounded label such as `29.97`.                                                                                                                            |
| Output frame `n`       | Evaluate at `n × fpsDenominator / fpsNumerator`, computed from the absolute index; never accumulate repeated floating-point frame deltas.                                                                       |
| Frame count            | `ceil(duration × fps)` frames covering `[0, duration)`. The final output timestamp is the final sampled frame, not an extra duplicate at the duration boundary.                                                 |
| Comparisons            | Exact interval and source-PTS comparisons; use validated integer fast paths after compilation and internal wide arithmetic when needed. Convert an easing progress to a number only after locating its segment. |
| Native API conversion  | Round once, with one documented rule, when an API requires integer microseconds. This rounding must not become the canonical timeline clock.                                                                    |
| Presence               | Start inclusive, end exclusive. A selected item outside its interval remains editable in the layer/timeline tree even when it contributes no pixels.                                                            |
| End-of-composition UI  | Distinguish an editable end boundary from the last displayable frame. Do not accidentally show an empty frame when the playhead reaches duration.                                                               |
| Video source time      | `sourceIn + (compositionTime − intervalStart) × playbackRate`, with a declared first-PTS normalization. Bound it to the selected source range.                                                                  |
| Effects' internal time | A fixed authored phase, a playhead-linked local phase or an explicit `time` keyframe track. These are mutually clear modes; applying an effect to video does not require animating that effect's phase.         |

Rational time is an architectural proposal that needs a small core benchmark before choosing its exact DTO layout. It must not turn every scalar property interpolation into repeated fraction allocation or expensive whole-document validation.

## Track gestures, hierarchy and undo

| Gesture or hierarchy case | Semantics                                                                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Move an interval          | Preserve duration/source trim. Translate its keyed animation with the item in one operation.                                                                                                                                   |
| Left/right trim           | Change the exposed interval and mapped source in/out points. Retain keys outside the new range so extending the trim can reveal them again; deletion remains explicit.                                                         |
| Group timing              | Proposed storage uses artboard-absolute time. Effective child presence is the intersection of child and ancestor intervals. Spatial parenting does not silently change time units or playback speed.                           |
| Move a group              | Explicitly translate its descendant intervals and keyed timing by the same delta. Preview through one retained temporal offset; commit the validated batch once.                                                               |
| Trim a group              | Clip child presentation without destructively cropping each child's stored keys or media range.                                                                                                                                |
| Reparent/ungroup          | Preserve the same composition-time appearance, following existing transform and compositing safety rules.                                                                                                                      |
| Mask dependencies         | Retain the canonical dependency graph. An inactive enabled source contributes zero source coverage, then normal luminance/alpha/inversion rules apply. Do not convert a temporally inactive source into a missing-layer error. |
| Pointer/key cancellation  | Restore original timing/value/easing and selection intent. Release captures and subscriptions.                                                                                                                                 |
| Commit boundary           | One completed trim, drag, multi-key edit or scrubbed property edit gives one engine transaction and one undo entry. Playback and seek add no history entries.                                                                  |

Group-time semantics require a native interaction spike against the Figma reference; the table is a consistent MusArt proposal, not an asserted Figma implementation detail.

## Typed properties and keyframe authoring

| Property class                 | Evaluation rule                                                                                                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Continuous numbers             | Registered bounds and interpolation, preserving authored units. Clamp only where the parameter's semantics require it, including overshooting easing.                                                                                            |
| Integer controls               | Explicit rounding/stepping policy from metadata; integer seeds use discrete changes rather than an accidental sequence of fractional seeds.                                                                                                      |
| Colors and alpha               | Typed color values. Fix an interpolation space and alpha policy before shipping. Proposed default is premultiplied linear interpolation in the working space, with native comparisons and a visible parity decision for Figma examples.          |
| Boolean/select/string controls | Hold/discrete changes. These controls are still keyframeable when authored, even though they are not continuously tweened.                                                                                                                       |
| Gradients                      | Target stable stop/palette identities and typed position/color fields. Structural stop count/order changes remain explicit validated edits.                                                                                                      |
| Common layer/effect controls   | Include transforms, opacity, paint, appropriate typography, effect amount/opacity/blend/composite/enabled fields and each effect-owned setting.                                                                                                  |
| Source audio controls          | Per-video-track volume uses typed numeric gain and mute uses a discrete boolean. Keep values available to preview and export audio consumers. Animated audio controls are a proposal; do not show diamonds until that capability is implemented. |
| Conditional controls           | Retain keyed values while temporarily hidden by another setting. Evaluation validates the active combination without destroying dormant curves.                                                                                                  |
| Identity/structure             | Layer IDs, parents, effect type and arbitrary object paths are not scalar animation targets. Creation, deletion and reparenting remain commands.                                                                                                 |

Generate descriptors from the existing typed effect definitions and domain-owned common descriptors. New effects should become animatable through metadata, not a large switch or a manually maintained second catalogue. Explicit allowlists prevent imported paths such as `__proto__`, missing effect IDs, wrong value types or invalid choice values from becoming executable property writes.

| Typed target    | Stable address / coverage                                                                                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layer property  | Layer ID plus a registered property key: position, size, rotation, opacity, fill/stroke, radius and supported typography. Spatial scale maps to the existing geometry contract rather than an unrelated second transform system. |
| Effect property | Layer ID, effect ID and a registered common key (`enabled`, `amount`, `scale`, `levels`, `color`, `seed`, `opacity`, `blendMode`, `composite`, `time`) where meaningful for that effect.                                         |
| Effect setting  | Layer ID, effect ID and a descriptor-validated setting key. `scope: settings` must remain distinct from a same-named common property.                                                                                            |
| Gradient stop   | Layer ID plus stable stop ID and typed color/position field; never a fragile array index that changes after insertion.                                                                                                           |
| Mask control    | Existing target layer ID plus enabled/inverted/mode; changing a source reference is an explicit structural command.                                                                                                              |
| Source audio    | Video layer/clip ID plus volume/mute. Audio consumers evaluate the same exact composition time.                                                                                                                                  |

The [actual effect catalogue](../../../packages/core/src/effects/catalog.ts) currently has **32 effects and 316 parameter descriptors** at this research baseline. This is a source-audit snapshot, not a second runtime registry. All of those descriptors must be classified; a continuous-only prototype is insufficient. Common compositing fields are additional to these counts.

| Effect family / exact type                                                                                                                         | Existing descriptors | Number / boolean / select / color |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------- |
| `dither`                                                                                                                                           | 5                    | 4 / 1 / 0 / 0                     |
| `ascii`                                                                                                                                            | 3                    | 2 / 1 / 0 / 0                     |
| `brightness`, `contrast`, `grayscale`, `saturation`, `hue`, `exposure`, `vibrance`, `temperature`, `tint`, `gamma`, `invert`, `sepia`, `threshold` | 1 each               | 1 / 0 / 0 / 0 each                |
| `blur`, `posterize`, `vignette`                                                                                                                    | 2 each               | 2 / 0 / 0 / 0 each                |
| `grain`                                                                                                                                            | 4                    | 3 / 1 / 0 / 0                     |
| `halftone`                                                                                                                                         | 3                    | 2 / 1 / 0 / 0                     |
| `gradient`                                                                                                                                         | 64                   | 54 / 1 / 3 / 6                    |
| `ripple`                                                                                                                                           | 14                   | 13 / 0 / 1 / 0                    |
| `shatter`                                                                                                                                          | 26                   | 21 / 1 / 1 / 3                    |
| `noise`                                                                                                                                            | 21                   | 15 / 2 / 2 / 2                    |
| `flashlight`                                                                                                                                       | 19                   | 17 / 1 / 0 / 1                    |
| `circle`                                                                                                                                           | 11                   | 8 / 0 / 1 / 2                     |
| `cyanotype`                                                                                                                                        | 20                   | 17 / 1 / 0 / 2                    |
| `datamosh`                                                                                                                                         | 13                   | 13 / 0 / 0 / 0                    |
| `crt`                                                                                                                                              | 32                   | 28 / 1 / 1 / 2                    |
| `bit-dither`                                                                                                                                       | 11                   | 7 / 1 / 1 / 2                     |
| `receipt`                                                                                                                                          | 33                   | 26 / 2 / 3 / 2                    |
| `pink-phosphor`                                                                                                                                    | 18                   | 15 / 0 / 0 / 3                    |

Preserve descriptor defaults, document bounds versus UI bounds, units/display scaling and conditional visibility. Seek evaluation must not reinterpret a displayed percentage as a raw scalar. Preflight referenced discrete shader/paint/text variants with bounded resource admission; do not compile an unbounded Cartesian product or assume changing a selector costs the same as updating a numeric uniform. Registry coverage tests must fail if any future descriptor lacks an evaluation/validation policy.

Inspector semantics must match the agreed reference: the diamond arms/adds a key at the current time; editing that armed property's value at a later time writes the next key. A separate global auto-key mode can arm previously untracked compatible properties. Editing routes need an explicit captured animation context (`artboard`, time, target, base/key mode), shared by numeric fields, colors, canvas gestures, reset actions and keyboard operations. Do not globally monkeypatch `engine.execute` with hidden mutable playback state.

Support linear, hold, ease-in/out/in-out, back, cubic Bézier and deterministic spring families. Proposed semantics store easing on the destination key for its incoming segment, following [Figma's official easing reference](https://github.com/figma/mcp-server-guide/blob/main/skills/figma-use-motion/references/motion-easing.md). Hold retains the previous value until the destination boundary; the [research discrepancy](figma-reference.md#easing-and-model-details) requires explicit tests rather than an unsupported universal parity claim. Seekable springs need a time-evaluable closed-form or precompiled bounded curve, not a simulation advanced by previous RAF calls. Do not approximate every easing with CSS `ease` or make random seek depend on previously visited frames.

## Runtime frame plan

A compiled artboard plan holds stable property descriptors, sorted keys, hierarchy/dependency indexes and media requirements. Evaluating a time produces only the changed properties, effective intervals and requested source sample identities. Static subtrees reuse prepared resources.

| Runtime channel    | Lifetime and ownership                                                                                                                                                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical document | Changes only for validated authoring edits. Playback does not clone/freeze/save it each frame.                                                                                                                                                                                         |
| Transport state    | Per-artboard playhead, playing/paused state and selection; engine-scoped, outside document undo. UI time labels/playhead poses update imperatively.                                                                                                                                    |
| Frame plan         | Immutable evaluation result or retained typed buffers with a generation; never published as thousands of Jotai/React updates.                                                                                                                                                          |
| Gesture draft      | Captures canonical revision, artboard, targets and animation time. Pauses playback before editing unless a separately designed recording mode is active.                                                                                                                               |
| GPU presentation   | One retained active editing renderer. Animated results use their own presentation ticket and cannot acknowledge a newer canonical document by mistake.                                                                                                                                 |
| Inactive artboards | User-confirmed: only the active composition plays. Retain each inactive artboard's playhead, timeline and frozen presentation; suspend its audio, decode and frame scheduling even when visible in the infinite workspace. Switching active artboards does not advance all the others. |

The current Timelapse presentation source and new Motion source need an explicit mutually exclusive mode arbiter. Export obtains its own frozen capture and cannot accidentally use a live UI preview or a different artboard's playhead. The user-confirmed Export split button routes its down-chevron “Export timelapse” action to the existing journal/replay exporter; the normal Motion export routes to the authored timeline. Opening the menu or exporting must not rewrite journals or convert history events into property keys.

## Dynamic source providers

Recommended design: a runtime provider is opened by a durable media reference and returns a bounded frame lease for a requested media time. Its result identifies the source revision, decode generation, actual PTS/duration, dimensions, orientation and color metadata, plus an explicit release operation. A Three adapter owns the texture and consumes the lease. The pure document contains none of these resources.

| Path                  | Native/library capability                                                                                                                                      | MusArt responsibility                                                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decoded file frames   | Installed Mediabunny `1.62.1` exposes `VideoSampleSink.getSample`, `samples`, `samplesAtTimestamps` and `VideoSample.toVideoFrame`.                            | Choose the sample by presentation timestamp, handle null/gaps/end ranges explicitly and bound decode admission.                                                 |
| GPU frame upload      | Installed Three `0.186.1` contains `VideoFrameTexture.setFrame`; it updates the texture from a caller-supplied `VideoFrame`.                                   | Reuse one owned texture per active source/layout. Hold the native frame through the actual upload/submission boundary and verify both backends.                 |
| Native video playback | Three `VideoTexture` uses an `HTMLVideoElement`; its WebGPU documentation requires `SRGBColorSpace`, unlike the current immutable-image texture configuration. | Useful for a preview spike; native `video.play()` is not the authoritative exact export clock. Verify the adapter avoids double transfer conversion.            |
| Camera                | Native `getUserMedia` yields a permission-controlled stream.                                                                                                   | Explicit user action, bounded active source, failure/ended handling and track shutdown; no persisted live stream or implicit permission prompt on project load. |

These APIs are complementary: Mediabunny demuxes/decodes/encodes; Three renders decoded frames and effects. Their availability does not prove a zero-copy or performant end-to-end path. [Three frame texture](https://threejs.org/docs/pages/VideoFrameTexture.html), [Three video texture](https://threejs.org/docs/pages/VideoTexture.html), [Mediabunny sample API](https://mediabunny.dev/api/VideoSampleSink).

Mediabunny samples and `toVideoFrame()` results have separate close obligations in the installed declarations. Return/cancel iterators and dispose the input when retiring a decoder. The frame lease boundary must be proven using delayed GPU/encode consumers; returning from `setFrame()` alone is insufficient evidence of safe release.

For the **user-deferred camera phase**, a camera is not seekable historical footage. Reproducible replay/export requires recording it to a durable media source first. An unrecorded camera can offer Live composition and still capture; it must not pretend that an offline export can reconstruct past camera frames. Browser permission requires a secure context and may remain unanswered; late permission results after cancellation must immediately stop their tracks. [Camera acquisition](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [track cleanup](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/stop).

## Preview and export are separate consumers

| Concern         | Interactive preview                                                                                                        | Deterministic export                                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Time authority  | Monotonic playback anchor or explicit scrub target; absolute time evaluation.                                              | Exact output frame index and rational FPS.                                                                                                    |
| Queue policy    | Latest requested seek wins; one active request plus a bounded latest pending target. Stale generations never publish.      | Ordered required frames, awaited decoding/rendering/encoding; no silent frame dropping.                                                       |
| Decoder access  | Sequential iterator while playing; new generation on seek; original or approved derived proxy.                             | Mediabunny reads **original** media, with sequential/sorted exact sample requests where possible; seek-aware access when source timing jumps. |
| Missed deadline | Keep the last acknowledged frame and expose buffering/degradation honestly. Do not grow a frame queue to catch up forever. | Wait or fail; output timing does not change because the machine is slow.                                                                      |
| Resource policy | Bound resident sources, decoded frames and scratch; pause hidden/non-active artboards.                                     | Separate admitted export job; await encoder backpressure and release each consumed frame.                                                     |
| Saved state     | No frame-by-frame document or history writes.                                                                              | Frozen validated project/media revision with explicit cancellation and missing-source errors.                                                 |

Mediabunny owns Motion file output, audio/video encoding and muxing, following the existing retained GPU canvas path. Three.js owns composition and effects; it does not replace Mediabunny as an exporter. A slow export may take longer than real time while producing the same authored timestamps and sampled frames. Codec availability is probed for the actual browser/container/settings and failures remain visible. [Mediabunny output and timestamps](https://mediabunny.dev/guide/writing-media-files).

Mediabunny separates presentation order from decode order and offers timestamp lookup/iterators; current public documentation agrees with the installed API. This supports the design, but variable-frame-rate, B-frame, first-PTS, gap and end-of-stream behavior still need native fixtures. [Media sinks](https://mediabunny.dev/guide/media-sinks).

## Simple Timelapse export: separate time mapping

Export's down-chevron action opens a **small Timelapse export dialog**, not the old complete Animate/replay editor. Its essential controls are final duration **1–30 seconds inclusive**, Export and Cancel. Explain that the full recorded creation is automatically accelerated/slowed to fit. Show real progress/cancel/error while exporting; do not add manual playback-speed, history trimming, keyframe, or timeline-editing controls to this simple flow.

Requirement trace: **HIST-01**, **HIST-02**, **HIST-03** and the Timelapse integration tasks. This duration constraint applies to the final history video only.

| Concern               | Timelapse contract                                                                                                                               | Difference from authored Motion                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Input                 | Existing complete journal/replay, frozen at export start.                                                                                        | Motion consumes the authored artboard timeline.                                                                     |
| Duration              | User chooses a finite final output length in `[1, 30]` seconds. Validate in the UI, service and headless adapter.                                | The Timelapse cap does not constrain a Motion composition/export.                                                   |
| Speed                 | Derived automatically from the complete history span and selected final duration. No separate speed slider.                                      | Motion does not remap the whole composition to an arbitrary export length.                                          |
| Output frame `n`      | Emit at the chosen output frame time; evaluate history at the explicit mapped journal time.                                                      | Motion evaluates authored animation and clip-local media at `n / fps`.                                              |
| History mapping       | Proposed endpoint-inclusive mapping `historyTime(n) = historySpan × n / (N − 1)` for `N` frames, preserving both first and final recorded state. | Motion samples its half-open output interval; do not copy this endpoint-compression formula into Motion evaluation. |
| Shared implementation | Reuse the retained GPU renderer, source/resource contracts, codec probes, backpressure, cancellation and Mediabunny output adapter.              | Shared platform infrastructure does not merge two different temporal models.                                        |
| History state         | Read the frozen journal; leave its timestamps, undo entries and source assets intact.                                                            | An export menu action must not create keyframes, change composition duration or rewrite history.                    |

Use one declared output frame grid and an exact end policy. Proposed generic rule: `N = ceil(D × fps)` for requested final duration `D`, with at least two representable frames for endpoint-inclusive replay. Sample `n` at `n / fps`; shorten the final sample duration to `D − time(N − 1)` so the file ends at `D` within the encoder/container timebase. Do not let optional frame-rate metadata snap that shortened duration back beyond the selected end. Validate this path against actual Mediabunny output/native decoding; a sample-count assertion alone is insufficient. Default Timelapse settings can choose an ordinary integer FPS, but no hidden rounding may turn the 30-second maximum into a longer file.

If a requested FPS/duration can represent only one frame, reject that unsupported pair instead of raising the frame count and silently exceeding duration. Reject empty/unavailable replay with a useful error; never simulate a completed export. The current replay exporter allows 0.1–120 seconds and has a minimum-two-frame rule; M18 requires aligned UI/service/CLI validation and explicit end handling. Reuse its history semantics deliberately rather than carrying those old bounds into the new simple dialog.

## Responsive scrub and automatic local proxies

Every seek has a generation and exact target time. The playhead and time label acknowledge input immediately; they do not wait for media. Correct-frame presentation is a second acknowledged boundary. Keeping an old frame visible is a temporary pending state, never evidence that the requested frame arrived. Measure both boundaries for forward, backward, random and alternating-GOP jumps.

| Mechanism               | Contract                                                                                                                                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seek admission          | Coalesce pending pointer samples to the latest target. Bound in-flight decode work; superseded work cannot block an unbounded queue of newer targets.                                                                             |
| Cancellation            | Return the previous iterator and retire its generation. Where decode is not immediately abortable, discard and release late output; do not publish it. Do not assume two concurrent `getSample()` calls cancel each other.        |
| Direction changes       | Prefer a nearby retained decoded frame, otherwise seek from an indexed random-access point. A backwards target must not wait for the previous forward playback sequence to finish.                                                |
| Frame cache             | Byte-bounded, timestamp-indexed leases with exact source identity. Admit a small neighborhood around the current target; never cache an entire long clip as decoded frames.                                                       |
| Automatic proxy trigger | Use observed decode/seek cost and source metadata to schedule local optimized preview media when needed. Thresholds and device envelope are benchmarked, not guessed from extension alone.                                        |
| Proxy encoding          | Prefer reduced spatial dimensions and dense keyframes/short GOPs while preserving source presentation timing, orientation and aspect. Preserve a verified source-PTS mapping. Do not silently reduce authored temporal precision. |
| Background policy       | One bounded conversion job, outside active gestures and competing export work. Show progress, cancel and retry/failure states. Cancellation does not immediately restart the same job without a defined retry policy.             |
| Cache identity          | Original durable ID/content revision, conversion-pipeline version, codec, dimensions, timing map and keyframe settings. Reject partial, mismatched or stale outputs.                                                              |
| Persistence             | Write a temporary derived result and publish its cache index only after completion and original/revision revalidation. Quota failure removes partial cache data and preserves the original project.                               |
| Quality boundary        | Proxy pixels are preview-only. Export opens an original-only provider and cannot accept a proxy lease. Deleting all proxies must not change output correctness or project portability.                                            |

Mediabunny's conversion API exposes resizing, keyframe configuration, progress and cancellation. These are useful ingredients for a proxy spike, not proof of a completed cache/seek policy. Frequent keyframes trade increased cache bytes for more efficient seeking. [Conversion](https://mediabunny.dev/guide/converting-media-files), [encoding configuration](https://mediabunny.dev/guide/media-sources).

## Source audio, synchronization and export

The first release preserves embedded source audio with mute and volume per video track. Separate imported audio tracks were not selected. Overlapping video layers still need their audible sources combined into the final soundtrack; writing multiple alternative container tracks does not guarantee that a normal player mixes them.

| Concern                | Contract                                                                                                                                                                                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Placement and trimming | Audio uses the same composition/source mapping and normalized source origin as its video, including nonzero or negative track start offsets. Trim at sample boundaries with one explicit rounding rule; fill genuine gaps with silence.                                                                   |
| Controls               | Mute suppresses the clip's audio; volume is an explicit gain with a documented range/default. Visual opacity does not imply audio gain. Ancestor interval clipping applies to audio as well as video.                                                                                                     |
| Preview clock          | One transport anchor maps composition time to audio output time. Do not allow independently running video elements to drift apart. Map the audio/output clock to the presentation clock and measure drift.                                                                                                |
| Playback restart       | Unlock/resume audio from user playback interaction; seek/pause/switch invalidates scheduled audio nodes. Start new buffers against the new generation/anchor; no old sound continues after a scrub.                                                                                                       |
| Scrubbing              | Proposed default is silent drag scrubbing, with audio resuming from the exact final target when playback resumes. Audible jog/shuttle is a separate UX choice, not a reason to delay the playhead.                                                                                                        |
| Offline samples        | Decode originals with Mediabunny, trim/resample/mix bounded PCM blocks at a declared output sample rate and channel layout, apply per-track gain/mute, and supply exact timestamps to its audio encoder. Audio sample index, not the video callback interval, determines audio timing.                    |
| Overlap and peaks      | Mix all active video-source audio with explicit channel mapping. Define clipping/headroom behavior and verify levels; do not silently normalize each clip or discard overlapping sources.                                                                                                                 |
| Mux and backpressure   | Feed video and audio in bounded interleaved time windows to the same Mediabunny output. Await both sources; close completed sources and finalize only after both finish. Avoid encoding an entire soundtrack before the first video frame.                                                                |
| Unsupported audio      | Probe input decode and output codec/container support before rendering. Report the exact failure and offer a supported explicit choice; never silently turn a project with audible tracks into a silent export.                                                                                           |
| Retiming               | Normal-speed video is the initial engineering proposal. A playback-rate control requires a stated pitch/time-stretch policy and shared A/V mapping before being exposed. The reference includes Ping-pong; define reverse-video/audio behavior and implement it before presenting that option as working. |
| Cleanup                | Stop/disconnect scheduled nodes, return iterators, close audio samples/native `AudioData`, and release AudioContext-owned references. A shared context is suspended/closed only by its owning service.                                                                                                    |

Installed Mediabunny `1.62.1` has `AudioSampleSink`, `AudioSample.trim`, `copyTo`, `setTimestamp`, `toAudioBuffer` and `AudioSampleSource.add`. They support the proposed block pipeline, but MusArt still owns the mixer, clip mapping and lifecycle. Audio PCM processing is distinct from prohibited production GPU image readback. [Audio sample API](https://mediabunny.dev/api/AudioSample), [audio sources and backpressure](https://mediabunny.dev/guide/media-sources).

Web Audio's output timestamps relate the audio device position to `performance.now()`, useful for measured preview synchronization. Closing a context alone does not release every still-referenced node/object. [Output timestamps](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp), [context cleanup](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/close).

## GPU caching and color correctness

| Rule                                       | Reason                                                                                                                                                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stable source identity plus frame revision | Every new decoded frame must invalidate its affected processing closure, even when the portable layer is unchanged.                                                                                      |
| Stable allocations                         | Update retained video textures/targets; do not allocate a new renderer, texture pool, cache entry family or original hash for every timestamp.                                                           |
| Dependency closure                         | Video used as an enabled mask must invalidate its targets; unrelated artboards and static layers must remain reusable.                                                                                   |
| Processed reference planes                 | Preserve the existing authored-density effect/mask contract, mip accounting and document-space patterns. Dynamic content invalidates pixels, not the reference geometry definition.                      |
| Color/orientation adapter                  | Account for frame rotation/flip/pixel aspect/color range/transfer once. Do not blindly copy immutable-image `NoColorSpace` configuration onto Three video textures or double-apply transfer conversions. |
| Unknown formats                            | Explicitly reject unsupported/HDR/color configurations until conversion and export semantics are verified; avoid silently black or mislabeled frames.                                                    |
| Capabilities and budget                    | Actual decoded dimensions, texture limits and byte budgets remain hard admission checks; a small compressed file is not a small decoded frame.                                                           |

Pure spatial effects can process each input frame through the existing graph. Effects needing preceding image frames, such as actual optical-flow-dependent motion processing, require a separate explicitly bounded temporal-state contract; the current photographic Datamosh approximation must not be relabeled as such an implementation.

## Binary persistence, portability and concurrency

| Operation        | Required contract                                                                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Import           | Probe metadata and supported decode path; capture target revision; atomically persist binary original, small media metadata, layer, mode and timeline changes.                   |
| Save             | Store frequently edited Motion metadata separately from immutable original bytes; update accounting incrementally. Playback performs no writes.                                  |
| Decode reads     | Use bounded Blob/range reads. Do not eagerly load every video in every artboard or repeatedly clone originals into workers.                                                      |
| Preview proxies  | Derived, evictable local records with incremental byte accounting; never duplicated into the authoring journal or substituted for originals.                                     |
| Portable export  | Include required binary originals once and the authored timeline; font portability remains explicit. Streaming output/container choice requires an implementation spike.         |
| Portable import  | Validate container paths, lengths, MIME/codec metadata, document targets, timings and all declared limits before adopting data.                                                  |
| Copy/paste       | Transfer timing/keys coherently with selected subtrees; use durable references or packaged originals, with truthful large-media limits. No session-only URL as a durable source. |
| Project deletion | Retire the durable ID atomically with document/media/journal deletion. Hash/decode/thumbnail work cannot resurrect deleted data.                                                 |
| Camera reopen    | Restore a small disconnected camera-source description; reconnect only through an explicit user action.                                                                          |
| Recovery         | Distinguish rejected writes from uncertain acknowledgments. A worker or decoder retry cannot adopt a newer project revision to force stale authoring data through.               |

## Implementation seams and dependencies

| Work package             | Owned surfaces                                                                                                                             | Gate before dependent work                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core time/property model | `packages/core` document, validation, commands, easing/evaluation and serialization/clipboard contracts.                                   | Approved exact time and interval/group semantics; confirmed base-design Static and group-inclusive count policies; exact unit tests and migration fixtures. |
| Storage/media service    | App acquisition/import/binary storage and injected original/proxy resolvers; reusable decoding/frame leases belong to packages/render.     | Core source/timing DTO; stale/cancel/error/atomic tests; immediate seek scheduling plus original-only export boundary.                                      |
| Renderer integration     | packages/render dynamic source preparation/frame leases, signatures, dependency invalidation, composition and retained resources.          | Native color/orientation/lifetime spike on both Three backends.                                                                                             |
| Playback controller      | Time anchoring, source admission, latest-only scrub, scene presentation and gesture arbitration.                                           | Core evaluator plus provider and renderer contracts.                                                                                                        |
| Inspector/timeline UI    | Registry-driven diamonds, track tree, trim/move/select/easing, mode transition confirmation and relocated controls.                        | Core authoring commands and captured edit context; confirmed Figma interaction notes.                                                                       |
| Audio                    | Reusable packages/render source trim/gain/mute/bounded offline mix; app-owned preview audio activation and scheduling.                     | A/V clock mapping; codec probes; decoded audio timing, silence, overlap and cancellation tests.                                                             |
| Export                   | packages/render Mediabunny exact time loop, injected original-only source resolver, audio mux and retained GPU encoder path.               | Frame identity and cleanup tests; native decoded output comparisons; proxy-independent output proof.                                                        |
| Headless public API      | Pure @musart/core author/compile/evaluate API; reusable @musart/render export API and injected platform adapters; optional CLI extensions. | T18 Bun/Node purity/equivalence, editor-free real browser export, readable-module audit and shared native output proof.                                     |
| Performance/audit        | Instruments, fixtures and frozen measurements.                                                                                             | Feature scenarios pass; use [performance and verification](performance-and-verification.md), never infer performance from mocks.                            |

## Decisions to resolve explicitly

1. Default video poster time in Static mode; base-design display/editing is resolved.
2. Exact rational time DTO, duration/FPS defaults, frame grid snapping and end-boundary authoring behavior.
3. Final item-count copy/localization and staged-import presentation; the group-inclusive counting rule is resolved.
4. New-layer insertion timing in an initialized dormant timeline, and duration-shortening behavior.
5. Group-time semantics and how multi-track moves/trims respect locks and source bounds.
6. Color interpolation space, integer/seed interpolation and unsupported structural properties.
7. Binary portable container/versioning and maximum supported file/decoded-resource limits.
8. Source audio gain range, output sample/channel defaults, peak policy and optional scrub audio need concrete defaults. Camera is user-deferred until video/timeline stability; recording/export details belong to that later phase.
9. Initial verified hardware/resolution/effect envelope for smooth preview, with explicit quality controls if required.

No production implementation should silently settle these through component-local defaults that later disagree with export, commands or another agent's subsystem.
