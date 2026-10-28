# Pixel selection and explicit masks

The magic wand samples the original pixels of the active image. A click selects a connected color region; dragging right or left adjusts tolerance around that fixed seed. Its main controls contain only tolerance and a bilingual help popover. Shift temporarily adds and Alt temporarily subtracts. The help also contains the advanced **Adjacent pixels only** switch: disabling it matches the seed color throughout that image. New, Add, Subtract and Intersect remain available in the selection API. This does not sample the composited canvas or other layers.

The interaction follows the [official Affinity Flood Select Tool reference](https://affinity.help/photo2/fr.lproj/pages/Tools/tools_floodSelect.html): a visible pixel selection comes before any mask, and dragging controls tolerance. This is a reference for the interaction, not a claim that every Affinity selection or painting feature is implemented.

## Presentation and document ownership

`PixelSelectionController` owns ephemeral selection state. Pointer movement coalesces requests to one worker. Pointer release accepts the selection and keeps its marching-ants outline; it does not execute a document command or create an undo entry. Cancel restores the preceding accepted selection. Deselect releases the source and worker.

The contextual toolbar labels **Erase area**, **Keep area**, **Invert selection** and **Deselect** directly, with translated Radix tooltips and key hints. **Keep area** requests the exact accepted coverage, encodes an opaque grayscale PNG and publishes one validated transaction containing the asset and layer mask. White reveals, black hides, and gray gives partial coverage through the existing GPU luminance mask composition. **Erase area**, Delete and Backspace apply the inverse coverage, hiding the selected pixels instead. Both operations preserve original image bytes and produce one undo entry.

When the image already has a mask, the new operation preserves that mask on an editable mask-source layer and combines the coverage through the existing GPU graph. A root source matches the target's world transform so nested parent opacity is not applied twice. Erase inverts the new selection before the previous mask is applied; it does not discard the previous clip. One undo restores the preceding mask and removes the added source and asset.

Ctrl/Cmd+D deselects the ephemeral pixel region instead of duplicating its image. Delete and Backspace consume pixel-selection intent even while a request is pending, so they cannot accidentally delete the image layer. Editable fields and modal controls retain their normal keys. A selected effect or mask attachment has priority over pixel intent; its normal attachment deletion remains available. An editing click returns keyboard ownership to the canvas, while hand/pan gestures preserve attachment intent.

Inverting or deselecting a selection changes presentation state rather than document history. Keep and Erase controls remain disabled until selection work settles.

Selection belongs to one active image. Selecting another layer, changing the project/page, or publishing a document edit invalidates its captured origin. Every asynchronous preparation, preview and mask export checks that origin again; a late worker response cannot modify a replacement project with reused IDs.

## Resource boundaries

- Original image decoding and native Canvas 2D preparation are allowed. No GPU texture is read back into JavaScript.
- A dedicated worker retains one original and one accepted alpha selection, with one replaceable draft and one active request. Repeated tolerance changes reuse those original pixels.
- The current source limit is 16,777,216 pixels. Larger originals fail explicitly before image preparation instead of allocating an unbounded flood queue.
- Preview messages contain bounded vector outline geometry. The help explains that highly detailed boundaries may use a simpler outline; accepted coverage and exported masks retain full source resolution. The main toolbar does not present approximation as a separate action or status.
- The SVG outline lives in viewport coordinates outside the scaled artboard, with a single non-scaling one-pixel stroke. World/layer transforms move its geometry while the dash length and speed remain in screen pixels. Its imperative subscriptions and viewport observer are released on unmount; moving tolerance does not rerender App, Inspector, CanvasArea, EditorCanvas or EditorScene. CSS animates only dash offset and respects reduced motion.
- Cancellation, project replacement and runtime disposal release the worker, listeners and request timer. No selection data enters the project journal until Keep or Erase.

## Verification

Mirrored unit tests cover flood modes, disconnected colors, partial alpha, bounded outlines, transport errors and timeouts, source reuse, stale preparation, cancellation, keyboard intent and one-transaction undo/redo. Mask-planning cases cover preservation of a previous clip under nested rotations and parent opacity. The authored native `test/browser/pixel-selection.spec.ts` checks retained dotted outlines, drag tolerance, modifiers, cancellation, explicit Keep/Erase, Ctrl/Cmd+D, nested transforms and stroke screenshots at 25%, 100%, 200% and 400%. Exports are decoded in a separate inspector page; source preparation is distinguished from forbidden GPU readbacks. These latest UI/erase/zoom additions still require the coordinated frozen-candidate run.

Run checks serially under the resource limits in [the performance protocol](performance/protocol.md). Newly written scenarios are not evidence of a passing browser run until executed against a frozen candidate.
