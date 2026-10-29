# Editor preferences

## Settings categories and appearance

| Setting         | Behavior                                                                                                                                                                                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Categories      | The settings dialog uses genuine vertical Radix tabs with four categories: General, Appearance, Shortcuts and Editor. The navigation remains visible while its selected content scrolls. Colored icon tiles identify categories; active rows and ordinary controls use the neutral theme. |
| Shortcut editor | Shortcuts embed the same `ShortcutSettings` and `BindingRow` controls as the standalone shortcut dialog, including real recording, conflict validation, clearing, resetting and persistent user overrides.                                                                                |

## Clipboard preference

| Setting               | Behavior                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default               | General also controls **Include images when copying**, enabled by default.                                                                                                |
| Stored value          | Its versioned `musart.clipboard.v1` preference contains one boolean and no project content.                                                                               |
| Copies without images | Turning it off keeps small local references in copied JSON; cross-project pastes then require copying again with images included. Native text copying is unaffected.      |
| Storage lifecycle     | The preference store validates external changes, releases its storage listener after the last subscriber, and retains the current choice when a storage write is blocked. |

## Appearance and accessibility

| Setting          | Behavior                                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Theme semantics  | Theme choices reuse the shared segmented Motion surface through genuine Radix radio semantics.                                    |
| Tab semantics    | Projects/Templates, guide categories and Design/Animate retain tab semantics; appearance values do not invent an empty tab panel. |
| Accessible names | Full translated accessible names remain available when the snapping-distance scrub handle is shown as a compact magnet.           |

## Snapping settings

| Setting                     | Behavior                                                                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                       | Editor snapping is one shared platform preference, not portable document data.                                                                              |
| Values and defaults         | `SnappingPreferenceStore` validates a boolean `enabled` and a finite attraction distance from 1 to 24 CSS screen pixels; defaults are enabled and 6 pixels. |
| Storage                     | Its small `musart.snapping.v1` record includes an explicit version. The store owns one cross-window storage listener while subscribed.                      |
| Failure handling            | Blocked writes preserve the current session's choice when controls mount again; invalid external records cannot replace a valid in-memory preference.       |
| History                     | No document snapshots or history entries are stored with these settings.                                                                                    |
| Shared controls             | The Jotai `snappingAtom`, command search and imperative gesture subscriptions share this same store.                                                        |
| Command search              | Search offers explicit Enable/Disable snapping actions and a direct Editor settings route, avoiding stale cached toggle labels.                             |
| Zoom and temporary override | Thresholds are converted from screen pixels using the current viewport zoom; Alt temporarily bypasses snapping.                                             |
| Numeric commits             | Editing the numeric distance commits once at the end of a scrub or typed change.                                                                            |

## Try snapping

| Setting                    | Behavior                                                                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Playground                 | **Try snapping** opens a compact Radix popover with two real core layers and `SnapIndex`, without expanding or resizing the settings panel.                       |
| Input                      | Pointer and arrow-key input use the actual resolver and live preferences.                                                                                         |
| Modifiers and cancellation | Shift increases the keyboard step, Alt bypasses snapping, Escape or pointer cancellation restores the gesture's starting position, and Reset restores the sample. |
| Preview                    | Its DOM transforms and cue lines update imperatively without editing the open project or rerendering editor surfaces per pointer event.                           |
| Cleanup                    | Closing it releases pointer capture, the resize observer and the preference subscription.                                                                         |

Mirrored tests exercise validation, storage failures and cross-window events, atom
updates, command routing, single numeric commits, actual shortcut recording and
sandbox cancellation/cleanup. Native browser scenarios cover persistence, keyboard
focus, short/narrow layouts, real drag input and screenshots. Run browser checks
separately from coverage using [the shared protocol](../performance/protocol.md).

## Pinned toolbar shortcuts

| Setting              | Behavior                                                                                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Context menu         | Pinned shortcuts in the left toolbar expose a genuine Radix context menu on right-click or Shift+F10 / Menu-key input.                                                      |
| Unpin                | **Unpin** updates the existing dock preference atom and local storage immediately, including for currently unavailable commands.                                            |
| Reordering and focus | Opening the menu cancels any reorder projection; removing a shortcut preserves the latest pin order and returns keyboard focus to a remaining shortcut or the pinned group. |
| Built-in tools       | Built-in tools remain separate, and removing a shortcut never executes its document command.                                                                                |
