# Keyboard shortcuts

Open **Keyboard shortcuts** from preferences, search or the default `?` key. The editor lists the actual tools, project actions, effects and directional commands with their icons. Search by command, category or current shortcut. Click a binding and press its replacement; Escape cancels recording. Each row can remove its binding or restore its defaults, and **Reset all** restores the complete set.

Overrides are validated and saved under the versioned `musart.keybindings.v1` local preference. Invalid keys, unknown commands and conflicting assignments cannot silently replace another command. Storage failures remain visible and leave the previous working configuration intact. Changes update keyboard dispatch, command search, dock/tooltips and project save keycaps together, including after a reload. The platform modifier is stored as `Mod` and displayed as Ctrl or ⌘. Pointer gestures such as Space-drag and trackpad navigation retain their separate navigation semantics.

Editor shortcuts leave text fields, sliders and modal controls to their own editing behavior. Save remains available while editing; shortcut recording consumes its keys without executing document commands. Search can toggle its own dialog but cannot bypass another modal dashboard or confirmation. The first-launch dashboard disables document shortcuts until a real project has been chosen. A queued command verifies its originating engine, project, page and revision before execution.

**Copy selected items** (`Mod+C`) and **Paste items** (`Mod+V`) use this same command
registry, binding editor, conflict validation and translated labels. The default
keys use native browser clipboard events, so ordinary copying and pasting needs no
clipboard permission. Alternate bindings and search/dock actions use the browser
Clipboard API and report denied or unavailable access. Native text editing remains
untouched in inputs, editable content and modal controls.

Copies are versioned `musart.clipboard` JSON containing editable layers, selected
subtrees, processing ancestors, complete mask dependencies and referenced original
images. Pasting preserves their relative geometry, uses fresh coherent layer,
effect, guide and asset IDs, and commits one atomic undo entry. The selection is
centered at the last pointer position inside the active artboard, or the artboard
center when there is no valid pointer position. A changed project, page or document
revision rejects an asynchronous paste rather than writing into a replacement.
**Copy composition as editable JSON** includes the full artboard properties and
pastes as a new artboard; this is also a shareable clipboard document.

General settings include **Include images when copying**, enabled by default.
Disabling it writes only local original references and a content freshness
fingerprint. Such copies require the same durable project and matching originals;
missing or changed source bytes are a real error. Included images remain portable
between projects and browser sessions. Fonts retain the existing portable document
family references. Clipboard input is bounded to 16 Mi UTF-16 code units (32 MiB
logical text), validated before any command, and excludes project history.

The search catalogue prepares document records only when opened and reuses them across selection and binding changes. Empty search mounts at most two results per category. Its input receives focus immediately while Motion presents a 160 ms opening and 100 ms closing transition, with a fading backdrop and bounded result-item entrance motion. Exiting commands are inert until Radix releases the dialog. Reduced motion skips visual transitions. Keyboard opening returns focus to its original canvas/control when closed; an obsolete focus-scope cleanup cannot steal focus back to the left toolbar while search is open. Native browser verification records first-frame focus, visual motion and real focus restoration separately from the two-frame content-readiness bound.
