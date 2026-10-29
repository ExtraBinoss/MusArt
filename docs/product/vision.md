# Product vision

MusArt aims to make 2D composition enjoyable: combine images, typography, shapes, masks and effects in a focused workspace that responds directly to your actions.

It is intended for artists and designers who want a lightweight creative tool across platforms, including Linux. Projects should stay under the creator's control, with no mandatory account or cloud service.

The [README](../../README.md#available-today) describes what is implemented today. This document preserves the product's intent and future directions; it is not a delivery schedule.

## The creative workflow

1. Start a composition from the local gallery, a template or a saved project.
2. Bring in images and text, then arrange them with layers and groups.
3. Explore editable effects and masks without changing the original images.
4. Refine typography, alignment and layout directly on the canvas.
5. Save an editable project and export a result that matches the composition.

## Product principles

- **Creation first.** Keep common actions easy to find and useful controls close to the artwork.
- **Responsive editing.** Prioritize the active gesture; prepare secondary previews when resources permit. Measure performance on real workloads.
- **Editable results.** Preserve original assets, layer structure, effects and masks so creators can change their decisions.
- **Local ownership.** Make creating, saving and exporting possible without uploading the project to a service.
- **Consistent automation.** Visual editing and headless operations should follow the same document rules and produce consistent output.
- **Room to grow.** Add capabilities through clear boundaries rather than tying document behavior to individual interface components.

## Future directions

These are directions from the original product plan. Each needs a focused scope before implementation; none has a committed release date.

| Direction          | Intended outcome                                                                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keyframe animation | A timeline with tracks, keyframes and interpolation for transforms, opacity, effects and other suitable properties. Animation evaluation should also work headlessly. |
| Richer typography  | Multiple styles within one editable text block, with consistent layout across the canvas and export.                                                                  |
| Interoperability   | Additional import/export formats that make exchanging artwork with other tools easier.                                                                                |
| Broader automation | Extend existing command-line workflows toward repeatable batch and sequential exports.                                                                                |
| Creative tools     | Expand useful effects and layer capabilities while preserving editable results and predictable resource use.                                                          |

Keyframe animation would let creators author motion over time. The current Animate feature replays completed edits as a timelapse; it does not provide that timeline or keyframe editor.

## Scope

MusArt focuses on 2D composition. Reproducing every capability of Photoshop, Affinity or Figma is outside its intended scope. 3D editing, mandatory cloud services, a marketplace and social features are outside the current product direction.

Online collaboration and a complete video-editing workspace were outside the original prototype. They should not be inferred from local saving, effect playback or timelapse export.

Implementation choices live in [the technical stack](../architecture/tech-stack.md), boundaries in [the architecture contracts](../architecture/contracts.md), and contribution requirements in [AGENTS.md](../../AGENTS.md). Actual delivered changes belong in [CHANGELOG.md](../../CHANGELOG.md).
