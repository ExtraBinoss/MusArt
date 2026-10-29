# Selection export

## Export scope

| Export topic          | Contract                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Snapshot              | The export popover captures a canonical document snapshot.                                                                                              |
| Selection or artboard | With a selected layer or group it exports cropped content by default; the whole-artboard switch restores the original canvas dimensions and background. |
| Multiple artboards    | Multi-artboard output remains an explicit ZIP option.                                                                                                   |
| Export scale          | Scale changes affect delivered resolution rather than the size of the preview viewport.                                                                 |

### Derived selection graph

| Export topic        | Contract                                                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core ownership      | `selectionComposition` is a pure core operation.                                                                                                                           |
| Crop and ancestors  | It keeps selected subtrees and their ancestor processing, computes pixel bounds with a small floating-point edge tolerance, and translates root transforms into that crop. |
| Mask dependencies   | Referenced mask subgraphs are copied under deterministic private IDs, including their required ancestor transforms and chained masks.                                      |
| Shared mask groups  | Separate copies prevent a partially selected mask group from losing content needed by another selected layer.                                                              |
| IDs and originals   | Effect and guide IDs are remapped as well; original assets are referenced without copying their bytes.                                                                     |
| Reserved identities | Callers reserve project, page and asset identities.                                                                                                                        |
| Document isolation  | The derived graph is render-only and does not modify the project or its undo history.                                                                                      |

### Preview rendering

| Export topic               | Contract                                                                                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Renderer and queue         | Preview requests share the retained thumbnail renderer and bounded queue.                                                                                                     |
| Priority                   | The export popover requests foreground priority after input release; background layer thumbnails remain deferred during active gestures.                                      |
| Reference density          | Originals and the complete enabled effect/mask stack use the same document-resolution reference as the canvas, then GPU mipmaps reduce the processed output.                  |
| Cached results and cleanup | Cached encoded blobs are reused, while consumer signals, canonical frame and requested-size checks, and owned blob URLs reject stale results and release abandoned resources. |

### Preview dimensions

| Export topic             | Contract                                                                                                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fit                      | The preview fits the selected scope's dimensions inside the measured viewport, including its padding and reserved scrollbars.                                                                            |
| Physical resolution      | A resize observer and browser resize events select the displayed physical resolution from the viewport and device pixel ratio before requesting the blob.                                                |
| Enlargement and edge cap | Enlarging requests up to twice that fitted size and enables scrolling; both the encoded edge and the displayed physical edge are capped at 768 pixels, so the limit can reduce the enlargement below 2×. |
| Small selections         | Small scopes also obey the renderer's maximum eightfold density before CSS dimensions are derived, avoiding an undersized backing image on high-DPR screens.                                             |
| Resize lifecycle         | Changing preview size requests an appropriately sized render without remounting the frame or reading GPU pixels into JavaScript.                                                                         |
| Independent export scale | The output export scale remains independent of the preview viewport.                                                                                                                                     |

Mirrored tests cover crop values, rotated parents, shared and chained mask dependencies, private ID collisions, dual paint/mask roles, 10,000-element batches, stale frames, cancellation and URL cleanup. `test/browser/export-selection.spec.ts` decodes real delivered files, checks selected alpha and full-artboard pixels, exercises preview scrolling, and instruments the production read APIs separately from image inspection.

### Density regression evidence

| Export topic        | Contract                                                                                                                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend coverage    | `test/browser/export-density-cap.spec.ts` verifies the high-DPR density boundary on both native backends.                                                                                                   |
| Former mismatch     | Before the fix, a 16×16 selection at DPR 3 encoded 128×128 pixels but occupied 192×192 physical pixels.                                                                                                     |
| Correct footprint   | Fit and expanded previews now both display their actual 128×128 backing footprint; native visible-image captures and zero production-readback counters are saved under ignored `artifacts/export-density/`. |
| Playback regression | The accompanying real Play-to-numeric-scrub regression preserves the frozen phase, commits the drag once and undoes the parameter and time independently.                                                   |
| Executed result     | Both backend pairs passed together in 7.2 seconds on the common frozen build.                                                                                                                               |

## Transparent container targets

A small cropped selection can retain a large transparent ancestor for its transforms, opacity and clipping. Enlarging that ancestor's entire rectangle would allocate an unrelated texture: a 1×11 tick at 8× must not require an 8640×15360 target for a 1080×1920 transport group.

| Export topic         | Contract                                                                                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Container window     | The render graph intersects plain container targets with the current parent target in the container's local coordinates.                                                           |
| Texel grid           | It retains the original texel grid and a one-texel reconstruction margin, clipped to the original container bounds.                                                                |
| Logical bounds       | `FrameTexture.bounds` records the covered logical rectangle; normal composition, primitive runs and nonnormal blends account for its origin without editing the portable geometry. |
| Allocation guard     | Target keys include the window, and all actual allocations still enforce the device limit and byte budget.                                                                         |
| Processing ancestors | Effect and enabled-mask ancestors retain their complete authored processing domain.                                                                                                |
| Child clip           | Their children receive that full processing target as their clip, not the final selection crop.                                                                                    |
| Referenced sources   | Directly referenced mask sources likewise keep their full coordinate domain.                                                                                                       |
| Preserved rendering  | This optimization changes neither effect parameters nor source resolution, does not flatten group opacity, and does not force plain groups to 1×.                                  |
| Portable metadata    | Selection export and editable clipboard documents preserve their existing ancestor metadata.                                                                                       |
