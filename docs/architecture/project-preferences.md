# Project layout preferences

Panel sizes and timeline zoom belong to the local project identity. They do not
change the portable document, revision, undo stack or replay journal.

| Field             | Stored value                                            | Restore behavior                                                                                         |
| ----------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `workspaceLayout` | Requested workspace/inspector percentages, totaling 100 | The split-panel library reapplies its pixel constraints on narrower screens.                             |
| `sidebarLayout`   | Requested properties/layers percentages, totaling 100   | Restored independently from the horizontal split.                                                        |
| `timelineHeight`  | Requested panel height divided by viewport height       | Recalculated and clamped to the current viewport; resizing the window does not overwrite the preference. |
| `timelineZoom`    | 20–640 CSS pixels per second                            | Shared by this project's compositions and restored when Motion opens.                                    |

The IndexedDB `preferences` store contains one small record keyed by
`JSON.stringify(["musart:project-layout", projectId])`:

```json
{
  "version": 1,
  "values": {
    "workspaceLayout": { "workspace": 75, "inspector": 25 },
    "sidebarLayout": { "properties": 60, "layers": 40 },
    "timelineHeight": 0.35,
    "timelineZoom": 240
  }
}
```

The schema admits only these fields and finite values. Reads are lazy, shared by
the project's consumers, and independent of manifests, assets and journal bodies.
The UI subscribes to individual fields; restoring preferences does not subscribe
the application or canvas roots to pointer updates.

| Lifecycle         | Contract                                                                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resize            | Continuous painting remains local. A completed pointer or keyboard resize stores the requested layout once; programmatic hydration and responsive constraint changes do not write. |
| Timeline zoom     | Slider changes commit on gesture completion. Wheel changes debounce for 600 ms after input; unmount and page hide flush the pending value.                                         |
| Late reads        | Per-field interaction generations prevent an asynchronous restore from overwriting newer input. Unsubscription rejects stale results from a previous project.                      |
| Concurrent fields | Each write transaction reads the latest small record and merges only its changed fields, preserving unrelated changes.                                                             |
| Project deletion  | The deletion tombstone and preference removal commit in the same transaction. Later preference writes check the tombstone and fail instead of recreating the record.               |
| Storage failure   | The current session stays usable, and translated restore/save errors retain their original cause for diagnostics. No successful save is simulated.                                 |

The timeline height helper retains at most 32 project-scoped ratios per editor
session as a fallback. IndexedDB is authoritative across reloads; a project with
no saved preference receives its own defaults.

Page hide and backgrounding also drain pending zoom writes as a best effort.
A browser crash or forced termination can interrupt an asynchronous IndexedDB
transaction; these events cannot guarantee persistence after a forced shutdown.
