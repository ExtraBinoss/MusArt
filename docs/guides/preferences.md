# Editor preferences

The settings dialog uses genuine vertical Radix tabs with four categories: General,
Appearance, Shortcuts and Editor. The navigation remains visible while its selected
content scrolls. Colored icon tiles identify categories; active rows and ordinary
controls use the neutral theme. Shortcuts embed the same `ShortcutSettings` and
`BindingRow` controls as the standalone shortcut dialog, including real recording,
conflict validation, clearing, resetting and persistent user overrides.

General also controls **Include images when copying**, enabled by default. Its
versioned `musart.clipboard.v1` preference contains one boolean and no project
content. Turning it off keeps small local references in copied JSON; cross-project
pastes then require copying again with images included. Native text copying is
unaffected. The preference store validates external changes, releases its storage
listener after the last subscriber, and retains the current choice when a storage
write is blocked.

Theme choices reuse the shared segmented Motion surface through genuine Radix radio
semantics. Projects/Templates, guide categories and Design/Animate retain tab semantics;
appearance values do not invent an empty tab panel. Full translated accessible names
remain available when the snapping-distance scrub handle is shown as a compact magnet.

Editor snapping is one shared platform preference, not portable document data.
`SnappingPreferenceStore` validates a boolean `enabled` and a finite attraction
distance from 1 to 24 CSS screen pixels; defaults are enabled and 6 pixels. Its
small `musart.snapping.v1` record includes an explicit version. The store owns one
cross-window storage listener while subscribed. Blocked writes preserve the current
session's choice when controls mount again; invalid external records cannot replace
a valid in-memory preference. No document snapshots or history entries are stored
with these settings.

The Jotai `snappingAtom`, command search and imperative gesture subscriptions share
this same store. Search offers explicit Enable/Disable snapping actions and a direct
Editor settings route, avoiding stale cached toggle labels. Thresholds are converted
from screen pixels using the current viewport zoom; Alt temporarily bypasses snapping.
Editing the numeric distance commits once at the end of a scrub or typed change.

**Try snapping** opens a compact Radix popover with two real core layers and `SnapIndex`,
without expanding or resizing the settings panel.
Pointer and arrow-key input use the actual resolver and live preferences. Shift
increases the keyboard step, Alt bypasses snapping, Escape or pointer cancellation
restores the gesture's starting position, and Reset restores the sample. Its DOM
transforms and cue lines update imperatively without editing the open project or
rerendering editor surfaces per pointer event. Closing it releases pointer capture,
the resize observer and the preference subscription.

Mirrored tests exercise validation, storage failures and cross-window events, atom
updates, command routing, single numeric commits, actual shortcut recording and
sandbox cancellation/cleanup. Native browser scenarios cover persistence, keyboard
focus, short/narrow layouts, real drag input and screenshots. Run browser checks
separately from coverage using [the shared protocol](../performance/protocol.md).

Pinned shortcuts in the left toolbar expose a genuine Radix context menu on right-click
or Shift+F10 / Menu-key input. **Unpin** updates the existing dock preference atom and
local storage immediately, including for currently unavailable commands. Opening the
menu cancels any reorder projection; removing a shortcut preserves the latest pin
order and returns keyboard focus to a remaining shortcut or the pinned group. Built-in
tools remain separate, and removing a shortcut never executes its document command.
