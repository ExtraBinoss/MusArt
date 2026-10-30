# Editable animation blocks

Motion opens with a block timeline. Each selected layer has an Animations section and an Add motion picker: two columns, categories, search, a built-in library, and a global My presets library. Static compositions do not show authoring keyframes. The Keyframes button explicitly enables the existing detailed timeline and inspector diamonds.

## Portable authoring

`MotionLayerTrack.animations` contains declarative `MotionAnimation` instances. Each instance owns its preset channels, exact start/duration, enabled state, intensity, and resolved effect slots. A channel contains normalized local points, easing, a registry-validated target, and an explicit add/multiply/replace operation. There is no second generated set of authoritative keyframes.

Ordinary authored keyframes evaluate first, then enabled action channels compose in array order. Add and multiply are explicit; replacement intentionally takes precedence. Endpoints hold outside the local interval. Layer occurrence presence still determines visibility and which occurrence contributes. Numeric contributions clamp to the registered property range after composition. Relative width/height distances rebase on the target's current canonical dimensions.

Presets instantiate independent effects with document IDs. Core commands validate application, edits and deletion atomically through normal engine transactions. Undo/redo, serialization, duplication, occurrence movement and clipboard identity remapping retain animation data. Deleting a referenced effect prunes the dependent action. Applying or changing a saved preset never changes existing instances in other projects.

`scaleX` and `scaleY` are optional positive layer transforms, defaulting to one, around the existing center pivot. They are independent of source width/height, so text, groups and children scale through the same transform. Core geometry, mask matrices, primitive instancing, normal/special blends and root/child cache signatures use these transforms. Scaling does not invalidate an unchanged source texture.

## Library and previews

The initial catalogue contains 61 recipes: 31 property combinations and 30 existing native GPU reveal/style operators. All use the same validated animation channels and renderer. Templates and browser previews do not implement an alternative animation engine.

The picker uses one retained GPU preview session and a shared locally bundled alpine-lake photograph. Only hover/focus starts playback; idle tiles own no animation loop. The canvas moves between tiles, work is latest-only and acknowledged, and document visibility, intersection, reduced-motion preference and disposal stop scheduling. Photo data is bundled locally and never fetched from a remote image service during browsing.

Personal presets live in a separate global `musart-motion-presets` IndexedDB database, independent of projects and their deletion. Every record has a UUID, revision and updated-order index. Cursor reads are bounded. Writes compare the current revision in a read/write transaction; deletion leaves a tombstone so delayed saves cannot resurrect a deleted preset. Errors are reported only as failures, and success is shown after transaction completion. Core extraction converts ordinary authored timelines to normalized, self-contained recipes without source project/layer IDs.

## Share Your Work reference

The bundled 480-square, 30 fps template reconstructs the supplied reference's rapid card collage with eight replacement Unsplash photographs, ten staggered entrances, one move action and separately layered white text. Its 1.5-second timeline completes the actions visible in the screenshot; the supplied video covers only 1.233 seconds. Each entrance combines centered scale and editable GPU blur. Photo drop shadows and an interleaved card/text stack reproduce the changing occlusion and shade visible in the source; see [the frame analysis and effect contract](../rendering/effects/shadow-blur.md). The reference does not establish a measured blur radius; the added blur is a requested treatment.

Generation uses public engine commands and records replayable batches. Photo source/license metadata lives beside the bundled JPEGs. The native template loader accepts an empty original-media sidecar list only when the validated project references no original-backed video/audio assets. PNG/JPEG image originals remain embedded in the portable project.
