# Animation presets

Select an object in a Motion composition and open **Animations → +** in Properties. The picker contains 61 built-in motions, with search and categories. The picker keeps a stable size across tabs, categories and empty results. Categories stay on one horizontal row; hover either shadowed edge to keep scrolling, or use the thin scrollbar, wheel or touch drag. The full remaining area contains a virtualized two-column grid with vertical scroll shadows. Arrow keys, Home and End navigate cards beyond the mounted window. Every card uses the same alpine-lake photograph; hover or keyboard focus previews the actual native renderer. Click a card to apply it. Static compositions keep animation authoring controls hidden.

## Everyday editing

The default timeline shows animation blocks and timed content, without property diamonds. Select a block to show its settings in Properties. Animation accordions and their Details section open and close smoothly, reverse from their current height when interrupted, and honor reduced-motion preferences:

- Change **Start**, **Duration**, and **Intensity**.
- Use **… → Reverse** to swap the animation's start and end. Its menu description explains this action.
- Disable the instance from its header. Duplicate and delete use compact footer icons with named tooltips.
- Drag a block to move it, or drag either edge to retime it. Each completed drag is one undo entry. Escape cancels the drag; arrow keys adjust placement. Delete removes the focused animation rather than its object.

Right-click an animation block to edit, add motion, enable/disable, reverse, duplicate or save it as a preset. A separator isolates the red **Delete animation** action; it removes only that animation. Canvas and layer menus offer contextual object editing, with destructive deletion separated at the bottom. Right-click empty canvas for Paste and Select all.

Relative movement adapts to the target's size. Scale transforms the object around its center, including a group's children, without changing text layout or source dimensions.

## Detailed control

Open an animation's **Details** disclosure to edit its channels, endpoint/intermediate values, normalized timing and easing. These changes belong to the applied instance and preserve its other channels.

The timeline's **Keyframes** button exposes the existing property timeline and inspector diamonds for custom authoring. Returning to **Animations** hides those controls and turns off auto-keyframing. Existing authored property curves remain intact.

## Personal presets

Choose **… → Save as preset** on an applied animation. For a custom property timeline, create at least two keyframes and choose **Save timeline as preset** in the selected object's Animations section. Give the preset a name, then find it in the picker's **My presets** tab in any project.

Personal presets live in this browser profile's global IndexedDB storage. They survive project changes and project deletion, and remain available after reloading. Clearing this site's browser storage removes them. Applying a saved preset makes an independent instance; later instance edits do not change the library entry or other projects.

## Reference example

Open **Templates → Share Your Work** for the reconstructed 1.5-second card collage: eight replacement photographs, ten staggered scale/blur entrances, editable photo drop shadows, interleaved text and one separate movement. It contains native editable layers and animation blocks, rather than a flattened reference video.
