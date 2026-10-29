# Guide controls

Guide presets and the project dashboard use the same genuine Radix/Motion
`SegmentedTabs` component. Preset cards and the popover keep fixed layout tracks
across category changes. Their decorative gradient previews preserve each catalogue
format's real aspect ratio and show safe-area metadata only when that format
provides it. Applying a preset appends editable framing guides; it does not replace
existing guides or resize the target.

## Object snapping

Dragging and corner resizing use the shared [core snapping index](../../packages/core/src/layout/snapping/engine.ts)
through the [canvas transform adapter](../../apps/web/src/canvas/interaction/snapping/transform.ts).
Targets include the artboard's edges and centers, margins, visible stationary layer bounds
and axis-aligned page/layer guides. Nested guides are transformed into page coordinates;
diagonal guides do not pretend to be horizontal or vertical targets. Hidden and mask-source
subtrees are excluded, as are the moving selection and descendants of a moving group.

The attraction distance is measured in **CSS screen pixels**, converted to page coordinates
using the current zoom. It therefore does not grow stronger merely because an artboard is
zoomed out or a display has a higher device-pixel ratio. The default is 6 pixels; the shared
preference accepts 1–24 pixels and can disable snapping. **Alt** bypasses attraction during
a transform. The canvas, explicit command-search actions and the real Try sandbox consume
the same persisted setting; see [Editor preferences](preferences.md).

Movement applies one world-space correction to the selected roots, converting it through
each parent transform so nested objects retain their local coordinates. Corner resizing
keeps its opposite anchor fixed. Aspect-constrained resizing rechecks the achieved corner
before presenting a cue; an unachieved alignment must not produce a convincing guide line.
Rotation gestures retain their own angle behavior rather than snapping a corner to an edge.

Object measurements are contextual: only an engaged snap draws its alignment line and,
when the matching spans are separated, their actual gap in document-coordinate units.
Releasing or cancelling the gesture clears those transient cues. Persistent ruler/page
guides remain editable independently. Guide colors participate in the cue where supplied;
the cue itself does not create a guide or a history entry.

The gesture builds its candidate index once. Queries use sorted axis and perpendicular
references instead of rescanning every stationary layer on every pointer event. Index
construction and selected-layer patch preparation still have their own costs; a bounded
query comparison count is not a measurement of complete input-to-frame responsiveness.

`Guide.color` is optional for compatibility with existing documents. The pure engine
validates it with the document color rules for both page and layer guides. Colors
are ordinary portable metadata and participate in undo, serialization and replay.
They do not become part of the exported artwork or invalidate rendered image paint.

Each row opens the existing compact `ColorControl` in a Radix popover. Live changes
use the scene preview port and update retained guide-line CSS variables. Cancellation
restores the canonical color. A completed color gesture commits at most one engine
command; choosing the current effective color creates no redundant undo entry.
Page/project replacement and locked targets reject late changes.

The small `musart.guides.last-color` browser preference stores only the most recent
opaque RGB choice, separately from project data. New panel/preset guides read it
when created; a ruler drag captures it at gesture start. Existing guides retain
their own colors. Invalid or unavailable preference storage preserves the current
session's valid choice, and the initial fallback is `#ed66c2`.

Mirrored tests cover validation, round trips, undo, live/cancel behavior, preference
failure paths, ruler capture and indexed transforms. Authored native scenarios in
[the preset visual workload](../../test/browser/guide-presets-visual.spec.ts) assert short
and tall viewports, card/popover stability, real aspect ratios, icon dimensions and
screenshots. [Preferences scenarios](../../test/browser/preferences.spec.ts) cover the
shared settings interface. These test definitions do not establish a passing native
result or a timing claim; retain outcomes from the frozen build's actual run. Run native
timing and rendering checks independently of unit coverage following
[the shared performance protocol](../performance/protocol.md).
