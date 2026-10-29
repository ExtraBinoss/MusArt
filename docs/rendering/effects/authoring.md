# Shared procedural effect authoring

## Definitions and uniforms

| Authoring topic   | Contract                                                                                                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Effect ownership  | Each effect owns pure metadata in `packages/core/src/effects/<id>/definition.ts`, its Three.js TSL graph in `packages/render/src/effects/<id>/`, and English/French resources under the web effect library. |
| Registries        | The registries contain definitions/builders only.                                                                                                                                                           |
| Imported settings | Imported settings reject unknown names, wrong types and out-of-range values.                                                                                                                                |
| Uniform updates   | Scoped values are resolved once per uniform update, with stable uniform identities; choice values use their declared option index and colors use encoded working RGB.                                       |

Definitions also declare whether raw treatment coverage is preserved or may be reduced. Preserving builders retain the source-alpha graph directly; ink opacity and transparent cuts declare reduction and have native default/partial-cutout witnesses. Optional Porter-Duff compositing remains a separate operation.

### Density, seeds and time

| Authoring topic     | Contract                                                                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spatial units       | All spatial fields use authored layer dimensions.                                                                                                                                |
| Reference transport | The complete stack, masks and isolated descendants use the common authored 1× reference and premultiplied GPU mip transport.                                                     |
| Zoom invariance     | A shader must not branch on editor zoom or change its seed with raster density.                                                                                                  |
| Integer seeds       | New seeded builders use the exact unsigned-integer seed uniform and keep seed offsets/frame additions integer through hashing; the legacy float port preserves older treatments. |
| Phase precision     | Periodic phases are reduced before multiplication by 2π or combination with spatial coordinates, avoiding Float32 loss at large valid times.                                     |
| Readback accounting | Test-only PNG decoding is isolated from production readback accounting.                                                                                                          |

### Radial gizmos

| Authoring topic    | Contract                                                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Metadata           | An optional radial gizmo describes normalized center keys, an outer radius, an optional protected radius, radius units and optional ellipse aspect/rotation keys.             |
| Derived geometry   | The canvas derives its geometry from that metadata, including nested owner transforms, without an effect-type switch.                                                         |
| Preview and commit | Handles publish imperative layer previews; a completed drag commits one validated command.                                                                                    |
| Cancel             | Escape, pointer cancellation and stale document/selection guards restore the original.                                                                                        |
| Keyboard steps     | Arrow keys move handles by one document pixel; Shift uses ten.                                                                                                                |
| Overlap resolution | Fixed-size pointer handles resolve overlaps by screen-space proximity, including nested transforms; the center takes exact ties and every handle remains keyboard accessible. |

### Live playback lifecycle

| Authoring topic  | Contract                                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Eligibility      | Effects with a top-level `time` parameter receive explicit live playback controls.                                          |
| Preview rate     | Playback publishes at most thirty phase previews per second through the existing imperative preview adapter.                |
| React boundary   | It creates no per-frame App, Inspector or canvas React state.                                                               |
| Pause and Escape | Pause commits the most recently requested phase once; Escape cancels.                                                       |
| Outside input    | Outside input, hiding the tab and window blur stop playback.                                                                |
| Unmount          | Unmount releases listeners and the pending RAF and cancels an unfinished preview.                                           |
| Export freeze    | Export opening and native image/project export freeze active phases for that engine before capturing the canonical project. |
| Engine isolation | Other editor instances are isolated.                                                                                        |

The live control does not invent simulation history. A shader with explicit phase can be deterministic and animated; a static photographic approximation such as compression-style Datamosh is documented as such. GPU output, resource bounds, actual decoded exports and real input gestures must be verified separately from graph topology tests.

## Delivery checklist

1. Record primary visual and algorithm references, the intended appearance and deliberate limitations in the effect's own documentation.
2. Define bounded metadata, strict imported-setting validation and stable GPU uniforms in the appropriate core/render directories.
3. Register creation, search, menus, English/French controls and serialization through the shared catalogs.
4. Verify real photographs and calibration scenes on both WebGPU and Three's WebGL2 backend. Inspect decoded exports for alpha, color space, masks, nested groups, deterministic seeds/time and extreme settings.
5. Check preview/export agreement across zoom levels. For spatial or animated effects, verify native gestures, cancellation, one-entry undo/redo, phase capture and cleanup.
6. Measure resource bounds and instrument production pixel-read APIs. Keep generated captures and reports in ignored `artifacts/`, with the measured build and environment identified.
7. Run the focused checks required by [AGENTS.md](../../../AGENTS.md), document actual results and request an independent audit when the task requires one. Release-wide gates belong to release preparation.
