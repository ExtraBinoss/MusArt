# Editable animation blocks

Motion opens with a block timeline. Each selected layer has an Animations section and an Add motion picker: two columns, categories, search, a built-in library, and a global My presets library. Static compositions do not show authoring keyframes. The Keyframes button explicitly enables the existing detailed timeline and inspector diamonds.

## Portable authoring

`MotionLayerTrack.animations` contains declarative `MotionAnimation` instances. Each instance owns its preset channels, exact start/duration, enabled state, intensity, and resolved effect slots. A channel contains normalized local points, easing, a registry-validated target, and an explicit add/multiply/replace operation. There is no second generated set of authoritative keyframes.

Ordinary authored keyframes evaluate first, then enabled action channels compose in array order. Add and multiply are explicit; replacement intentionally takes precedence. Endpoints hold outside the local interval. Layer occurrence presence still determines visibility and which occurrence contributes. Numeric contributions clamp to the registered property range after composition. Relative width/height distances rebase on the target's current canonical dimensions.

Presets instantiate independent effects with document IDs. Core commands validate application, edits and deletion atomically through normal engine transactions. Undo/redo, serialization, duplication, occurrence movement and clipboard identity remapping retain animation data. Deleting a referenced effect prunes the dependent action. Applying or changing a saved preset never changes existing instances in other projects.

`scaleX` and `scaleY` are optional positive layer transforms, defaulting to one, around the existing center pivot. They are independent of source width/height, so text, groups and children scale through the same transform. Core geometry, mask matrices, primitive instancing, normal/special blends and root/child cache signatures use these transforms. Scaling does not invalidate an unchanged source texture.

## Library and previews

The catalogue contains 61 general recipes (31 property combinations and 30 native GPU reveal/style operators), plus three Typography recipes for editable text. All use the same validated animation channels and renderer. Typography adds source-owned contour morphing, per-letter timing and generated inflation/stretch, with authored vector states for precise designs; see [native contour morphing](../rendering/text-morph.md). Templates and browser previews do not implement an alternative animation engine.

The picker uses one retained GPU preview session and a shared locally bundled alpine-lake photograph. Only hover/focus starts playback; idle tiles own no animation loop. The canvas moves between tiles, work is latest-only and acknowledged, and document visibility, intersection, reduced-motion preference and disposal stop scheduling. Photo data is bundled locally and never fetched from a remote image service during browsing.

Personal presets live in a separate global `musart-motion-presets` IndexedDB database, independent of projects and their deletion. Every record has a UUID, revision and updated-order index. Cursor reads are bounded. Writes compare the current revision in a read/write transaction; deletion leaves a tombstone so delayed saves cannot resurrect a deleted preset. Errors are reported only as failures, and success is shown after transaction completion. Core extraction converts ordinary authored timelines to normalized, self-contained recipes without source project/layer IDs.

## Share Your Work reference

The photo-collage template retains eight licensed replacement photographs, centered scale, editable GPU blur, drop shadows and an interleaved card/text stack. Its current looping version is described below; the original reference analysis remains in [the shadow/blur contract](../rendering/effects/shadow-blur.md).

Generation uses public engine commands and records replayable batches. Photo source/license metadata lives beside the bundled JPEGs. The native template loader accepts an empty original-media sidecar list only when the validated project references no original-backed video/audio assets. PNG/JPEG image originals remain embedded in the portable project.

## Seamless branded templates

The durable `share-your-work` template ID now presents **Too Hot to Haunt**.
Its 1.2-second photo cycle uses ten editable action blocks over eight images.
Occurrences crossing the loop boundary are split and their channel curves are
clipped at the same phase; opacity and blur return continuously rather than
popping a card or resetting a drift. Preview sampling floors the 30 fps index,
so the last subframe cannot round into the exclusive composition end.

The durable `morphing-type` ID now presents **Melt Mascot**: the shared mascot's
radial profile, native vector contour morphing, editable facial shapes and a Melt
wordmark in the shared brand primary on white. Nine contour states close over
2.4 seconds. It contains no reference-letter outlines or reference footer marks.
Both templates retain their public IDs for existing links and regenerate from
public command builders under `scripts/templates/`.

`test/browser/template-seamless.spec.ts` verifies genuine WebGPU and WebGL
frames, exact first/terminal pixel continuity, changing intermediate poses and
white mascot corners. On Chrome 154/Linux at a 480 px output edge, both templates
had zero mean RGB difference at the seam and zero production pixel-readback
calls. This is a functional witness, not an input-latency or physical-display
measurement. Captures are in `artifacts/template-seams/`; the checked-in WebP
posters are native encodings of reviewed rendered frames. Verification is
serialized with a one-core CPU quota, bounded memory and no swap.

## Detailed timeline

Keyframes mode projects animation channels into property rows alongside ordinary authored tracks. Derived presentation IDs identify the animation, channel and point in the captured revision; they are never serialized as a second set of tracks. Dragging interior points updates normalized channel times. Dragging an endpoint changes the block interval while preserving intermediate absolute times; selecting every point moves the block. Crossings and negative intervals are rejected atomically. Endpoints remain required, so deletion removes intermediate points or complete channels while retaining at least one channel. Easing edits update the original preset channel. Live previews recompile only affected animation samplers, retain canonical documents, and commit once per completed gesture.
