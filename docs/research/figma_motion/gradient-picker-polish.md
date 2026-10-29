# Gradient picker interaction and layout

The user supplied [this unchanged visual reference](assets/gradient-picker-reference.png).
The requested addition is a shared **Solid / Gradient** segmented control
(**Uni / Dégradé** in French), followed by a compact, modern gradient editor.

| Surface           | Interaction                                                                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fill mode         | The genuine shared Radix segmented choice switches between the existing solid fill and gradient metadata. The saved solid color is preserved.                                                                                              |
| Gradient settings | A compact Linear / Radial select sits beside the angle field. The angle is shown for linear gradients. Existing Motion controls remain available for kind and angle.                                                                       |
| Color ramp        | A horizontal stop ramp uses the exact authored colors and alpha. Colored thumbs select stops and drag horizontally. The ramp always runs left to right so stop positions remain legible independently from spatial angle and radial paint. |
| Stop rows         | Every stop has position %, a swatch opening the shared color palette, an editable RGB hex value, opacity %, and a removal action. RGB-only edits preserve alpha; an explicit RGBA value can replace it.                                    |
| Add and remove    | Adding samples the widest interval using the core interpolation helper. The existing 2–8 stop limit and fixed 0% / 100% endpoints are retained; duplicate positions remain valid hard edges.                                               |
| Keyboard          | Arrows adjust a focused thumb by 1%, Shift+Arrow by 10%; Home/End move it to its neighboring bounds. Escape cancels a draft. A held key commits once on release.                                                                           |
| Theme             | Regular hover, selected rows, fields and segmented surfaces are neutral. Primary marks the selected stop thumb. Existing shared themed selects, popovers, tooltips and numeric controls are reused.                                        |
| Narrow inspector  | Container queries move RGB and numeric fields onto two compact rows rather than overflow the property panel.                                                                                                                               |

Continuous movement updates the ramp, stop thumbs, swatches and passive fields
imperatively. Preview patches use the established inspector preview channel;
document commands are emitted once at gesture completion. Escape, pointer
cancellation, lost capture, window blur, owner changes and Motion time changes
cancel active drafts. Unmount removes subscriptions and releases held pointers.
No document schema, rendering engine, color interpolation or gradient-stop
animation addressing is introduced by this UI change.

Focused verification belongs to the mirrored `gradient/*.test.ts(x)` tests and
the existing Inspector integration scenario. Browser verification should inspect
the dark and light themes, narrow property panels, thumb drag/cancellation,
palette editing and undo; these checks share the workstation's serialized
CPU/GPU slot with the other Motion investigations.
