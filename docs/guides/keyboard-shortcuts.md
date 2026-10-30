# Keyboard shortcuts

These tables list MusArt's **default shortcuts**. They cover familiar creative-editor actions and MusArt's own tools. Every command binding can be changed in **Preferences → Shortcuts**, including commands with no default key. The shortcut shown in the app always reflects your current settings.

**Ctrl** below means **Ctrl on Windows/Linux** and **Cmd (⌘) on macOS**. **Alt** means **Option (⌥) on macOS**. Shortcuts act on the canvas; text fields, menus and dialogs keep their normal keyboard behavior. Save also works while editing a field.

## Everyday editing

| Action                | Default shortcut           | What it does                                                                                                                                         |
| --------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Undo                  | `Ctrl+Z`                   | Undo the last document edit.                                                                                                                         |
| Redo                  | `Ctrl+Shift+Z` or `Ctrl+Y` | Restore an undone edit.                                                                                                                              |
| Copy selected items   | `Ctrl+C`                   | Copy editable layers, groups, effects, masks and their original images. See [sharing artwork](#copy-paste-and-share-artwork).                        |
| Paste                 | `Ctrl+V`                   | Paste copied MusArt artwork, import clipboard images, or create a text layer from plain text.                                                        |
| Select all            | `Ctrl+A`                   | Select all layers in the active artboard.                                                                                                            |
| Duplicate             | `Ctrl+D`                   | Duplicate selected layers. With an active pixel selection, this clears the pixel selection instead.                                                  |
| Deselect              | `Escape`                   | Clear the layer selection and return to the pointer tool.                                                                                            |
| Delete                | `Delete` or `Backspace`    | Delete selected layers, or the selected effect/mask attachment. With an active pixel selection, hide the selected image area using an editable mask. |
| Group                 | `Ctrl+G`                   | Group selected layers.                                                                                                                               |
| Ungroup               | `Ctrl+Shift+G`             | Ungroup selected groups.                                                                                                                             |
| Move selection        | `←` `→` `↑` `↓`            | Move unlocked selected items by 1 document pixel.                                                                                                    |
| Move selection faster | `Shift` + arrow key        | Move unlocked selected items by 10 document pixels.                                                                                                  |

For Photoshop users: check the MusArt defaults before relying on muscle memory. In particular, **`Ctrl+D` duplicates layers** unless a pixel selection is active, and **`Ctrl+S` saves to this browser**. Download an editable `.musart` backup through the project menu or Magic Search.

## Tools

| Tool                | Default shortcut | Use                                                                                       |
| ------------------- | ---------------- | ----------------------------------------------------------------------------------------- |
| Pointer / selection | `V`              | Select, move and transform layers.                                                        |
| Hand                | `H`              | Drag to pan the workspace.                                                                |
| Text                | `T`              | Add editable text.                                                                        |
| Shape library       | `U`              | Use the last chosen shape, icon or brand artwork. Open the tool's menu to choose another. |
| Rectangle           | `R`              | Draw a rectangle.                                                                         |
| Ellipse             | `O`              | Draw an ellipse.                                                                          |
| Magic wand          | `W`              | Select connected colors in an image.                                                      |
| Object selection    | `S`              | Select objects with the local AI model.                                                   |

## Projects, files and view

| Action             | Default shortcut     | What it does                                                                                          |
| ------------------ | -------------------- | ----------------------------------------------------------------------------------------------------- |
| New project        | `Ctrl+N`             | Open project creation.                                                                                |
| Open project       | `Ctrl+O`             | Open a portable `.musart` project.                                                                    |
| Import images      | `Ctrl+Shift+O`       | Choose images to add to the active artboard.                                                          |
| Save               | `Ctrl+S`             | Save the project locally in this browser.                                                             |
| Export image       | `Ctrl+Shift+E`       | Open image export for PNG, JPEG or WebP.                                                              |
| Fit view           | `Ctrl+0`             | Fit the project's artboards into the workspace.                                                       |
| Reset view / 100%  | `Ctrl+1`             | Restore the default view at 100% zoom.                                                                |
| Zoom in            | `Ctrl++` or `Ctrl+=` | Increase canvas zoom.                                                                                 |
| Zoom out           | `Ctrl+-`             | Decrease canvas zoom.                                                                                 |
| Toggle rulers      | `Ctrl+R`             | Show or hide rulers.                                                                                  |
| Magic Search       | `Ctrl+K`             | Find and run tools, effects, adjustments, project actions and settings, or jump to an artboard/layer. |
| Keyboard shortcuts | `?`                  | Open the searchable shortcut editor.                                                                  |

Holding a nonrepeating editor shortcut such as **Ctrl+R** performs its action once and continues to reserve the key until release. Separate presses each toggle the rulers immediately; their SVG ticks remain cached while hidden. Ruler visibility does not pause Motion playback.

The zoom controls also offer **100%**, **Fit** and **Recenter**. Browser- or OS-reserved shortcuts can take priority; use Magic Search or assign another binding when needed.

## Canvas gestures and pixel selections

These gestures are separate from the editable command bindings.

| Gesture or key                                 | Action                                                                                                          |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Mouse wheel / two-finger trackpad scroll       | Pan vertically and horizontally.                                                                                |
| `Shift` + vertical wheel                       | Pan horizontally.                                                                                               |
| `Ctrl` + wheel / trackpad scroll               | Zoom around the pointer.                                                                                        |
| Hold `Space` and drag                          | Temporarily pan the workspace.                                                                                  |
| `Shift`-click or `Ctrl`-click artwork          | Add an item to the layer selection, or remove it if already selected.                                           |
| Right-button drag                              | Select unlocked artwork intersecting the selection rectangle. A stationary right-click preserves the selection. |
| Hold `Shift` while drawing a shape             | Draw a square or circle.                                                                                        |
| Hold `Shift` while resizing / rotating         | Constrain proportions / rotate in 15° steps.                                                                    |
| Hold `Alt` while moving / resizing             | Temporarily bypass snapping.                                                                                    |
| Magic wand: click, then drag left/right        | Select a color region and adjust its tolerance.                                                                 |
| Magic wand: `Shift`-click                      | Add to the pixel selection.                                                                                     |
| Magic wand: `Alt`-click                        | Subtract from the pixel selection.                                                                              |
| Active pixel selection: `Ctrl+D`               | Clear the pixel selection.                                                                                      |
| Active pixel selection: `Delete` / `Backspace` | Hide the selected region through a mask, preserving the original image.                                         |
| `Escape` during a canvas gesture               | Cancel the gesture and restore its starting state.                                                              |

See [pixel selections](selection.md), [snapping](snapping.md) and [layers](layers.md) for details.

## Copy, paste and share artwork

**`Ctrl+C` copies; `Ctrl+V` pastes.** MusArt copies editable artwork as text (JSON), with its layers, groups, effects, masks and original images. You can send that text to someone else and they can paste it into their own MusArt project.

| What you want to do                         | Steps                                                                                                                                                                                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reuse selected artwork                      | Select the layers, press `Ctrl+C`, then press `Ctrl+V` in the destination artboard or project.                                                                                                                                                       |
| Send editable items to someone              | Keep **Preferences → General → Include images when copying** enabled (the default). Copy the items, paste the full copied text into a message or text file, and send it. The recipient copies that text and presses `Ctrl+V` on their MusArt canvas. |
| Share a complete artboard                   | Open `Ctrl+K`, run **Copy composition as editable JSON**, and send the copied text. Pasting it creates a new artboard with its properties and contents. This command has no default shortcut; you can assign one.                                    |
| Bring in a screenshot or image              | Copy the image in another app, then press `Ctrl+V` on the canvas. The browser must provide image data in the clipboard.                                                                                                                              |
| Add plain text                              | Copy text, then press `Ctrl+V` on the canvas to create a text layer. Paste into a text field to edit that field instead.                                                                                                                             |
| Send a whole project or a large composition | Download an editable `.musart` file from the project menu and send the file. The recipient opens it with `Ctrl+O`.                                                                                                                                   |

Pasted items keep their relative layout and stay editable. MusArt centers them at the last pointer position inside the active artboard, or at the artboard center when there is no valid pointer position. Each paste creates one undo entry.

Keep **Include images when copying** enabled for sharing between people, projects or browser sessions. Turning it off produces smaller copies that depend on unchanged originals in the same saved project. Custom fonts must be installed separately in the recipient's browser; see [font portability](fonts.md). Clipboard documents do not include edit history, and large copies may exceed the clipboard or messaging service's limits.

Standard `Ctrl+C` / `Ctrl+V` use native clipboard events. Running clipboard actions through Magic Search, a pinned action or a custom binding uses the browser Clipboard API, which may require permission. Sharing is manual: send the copied text or a project file to your recipient.

Portable clipboard and project files currently support embedded images. Video originals remain in local storage; portable video packaging is a separate pending feature.

## Motion timeline

These controls apply while the timeline is focused. Document shortcuts use the bindings configured in Preferences; text fields keep their normal editing behavior.

| Action                        | Default shortcut or gesture           | Scope                                                                       |
| ----------------------------- | ------------------------------------- | --------------------------------------------------------------------------- |
| Play / pause                  | `Ctrl+Space` (`⌘Space` on Mac)        | Canvas or timeline controls, excluding text entry. Editable in Preferences. |
| Step one frame                | `←` / `→`                             | Focused time ruler; pauses playback.                                        |
| Start / exact composition end | `Home` / `End`                        | Focused time ruler.                                                         |
| Undo / redo a document edit   | `Ctrl+Z` / `Ctrl+Shift+Z` or `Ctrl+Y` | Timeline controls, excluding active text entry.                             |
| Save                          | `Ctrl+S`                              | Timeline controls and fields.                                               |
| Delete selected keys          | `Delete` / `Backspace`                | Timeline selection; keeps layers intact.                                    |
| Cancel the current gesture    | `Escape`                              | Key/track drag, time scrub, marquee or panel resize.                        |
| Zoom the timeline             | `Ctrl` + wheel                        | Timeline viewport, around the pointer.                                      |
| Scroll time / tracks          | Wheel or two-finger trackpad          | Both horizontal and vertical axes.                                          |

The Play/Pause tooltip shows the active binding as keycaps. `Space` alone also remains available with ruler, track or key focus; it still pans the canvas when held there. macOS may reserve `⌘Space` for [Spotlight](https://support.apple.com/guide/mac-help/keyboard-shortcuts-mchlp2262/mac); reassign the Motion binding or the system shortcut if needed.

The running counter uses fixed-width tabular digits and stable display precision (whole milliseconds or three decimal seconds). Focusing it reveals its exact editable value; scrubbing and keyframe previews retain rational time without document edits or React frame updates.

Click a property's diamond in the inspector to create its first key at the current time. Subsequent edits of that animated property create or update a key at the playhead.

## Customize shortcuts

1. Open **Preferences → Shortcuts**, press `?`, or find **Keyboard shortcuts** in `Ctrl+K`.
2. Search by action, category or current shortcut.
3. Click a binding and press the replacement keys. Press `Escape` to cancel recording.
4. Remove a binding or restore its defaults on that row. **Reset all** restores every default.

Changes are saved in this browser and update command search, tooltips and key hints. Conflicting assignments are reported so you can resolve them. Preferences are separate from project files.

Effects, adjustments and actions such as **Copy composition as editable JSON**, **Download project**, **Add artboard**, **Recenter**, **Toggle visibility**, **Toggle lock**, **Design**, **Animate** and **Enable/Disable snapping** have no default binding. Run them through Magic Search, pin them to the dock or assign keys in preferences.
