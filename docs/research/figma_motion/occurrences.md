# Repeated visual occurrences

A canonical layer has one place in the Layers tree and one z-order. A Motion
track is a temporal occurrence of that layer, not another visual object. Several
tracks can share a layer ID and appear as clips on the same timeline row.

| Authored scope                                       | Ownership                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Layer, asset, effects, masks, parent and base design | Canonical layer, shared by all occurrences                                                  |
| Start/end, source in-point, source mute/volume       | One occurrence (`track.id`)                                                                 |
| Property tracks, key identities/values/easing        | One occurrence; never shared mutable channels                                               |
| Key time                                             | Exact composition-relative rational time; version 2 retains signed pre-roll                 |
| Static                                               | Authored canonical base; all occurrence animation stays dormant                             |
| Visual presence                                      | Half-open interval intersected with the composition and every ancestor's occurrence windows |
| Overlap                                              | Occurrences of the same canonical layer cannot overlap; adjacency is allowed                |

## Compatibility

Version 1 documents retain implicit full-duration presence for layers without a
track. They still reject duplicate tracks for one layer. The first add, duplicate
or delete occurrence command promotes Motion to version 2, materializing those
implicit legacy presences once. Existing authored tracks and their identities do
not change. Original media bounds are preserved when an implicit video is made
explicit. This promotion is part of the same validated undoable transaction.

In version 2 an untracked layer is absent in Motion, so deleting the final
occurrence leaves an empty row rather than revealing the layer for the whole
composition. Its canonical layer remains available in Static and Layers. Newly
inserted canonical layers still receive their usual initial occurrence. Toggling
Static/Motion never initializes or copies occurrences again.

## Headless authoring

```ts
engine.execute({
  type: "duplicateMotionOccurrence",
  trackId: original.id,
  start: { value: 3, rate: 1 },
});
engine.execute({
  type: "upsertMotionKeyframe",
  trackId: copied.id,
  target: { kind: "layer", layerId: copied.layerId, property: "x" },
  time: { value: 7, rate: 2 },
  value: 200,
});
```

| Command                                           | Effect                                                                                                                                                                                              |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addMotionOccurrence {layerId,start,end}`         | Adds an empty channel set using the canonical base; no layer or effect copy                                                                                                                         |
| `duplicateMotionOccurrence {trackId,start,end?}`  | Copies one occurrence, allocates fresh track/property/key IDs, shifts every key by the exact placement delta, keeps media sourceIn; an optional end trims the copy to a gap without discarding keys |
| `deleteMotionOccurrence {trackId}`                | Removes only that occurrence and its channels                                                                                                                                                       |
| `moveMotionTrack {trackId,delta}`                 | Version 2 moves that occurrence and its keys; sourceIn stays unchanged                                                                                                                              |
| `setMotionTrackRange {trackId,start,end}`         | Trims that occurrence, retaining off-range keys; video start trim advances its own sourceIn                                                                                                         |
| `setMotionMedia {trackId,patch}`                  | Changes only that occurrence's source placement/audio                                                                                                                                               |
| `upsertMotionKeyframe {trackId?,target,time,...}` | Explicit ID addresses an occurrence; otherwise a unique occurrence at time is required if the layer repeats                                                                                         |
| `applyMotionTransition {trackId?,layerId,...}`    | Ordinary progress keys target the chosen occurrence; several occurrences require an explicit ID                                                                                                     |

Every command is one history entry; transactions remain atomic, and failed
placement/overlap/source/lock validation publishes nothing. Version 1 group moves
keep their historic descendant placement behavior. Version 2 group occurrence
moves do not retime independent child occurrences; temporal parent windows still
clip their presence. Duplicating a group occurrence does not duplicate its
canonical children or their keys.

Extending duration to append a new occurrence freezes any inherited end on that
same row at the old composition end, preventing it from growing over the new
clip. Other layers' inherited ends continue to follow composition duration.

## UI adapter contract

`listLayerMotionOccurrences(page, layerId)` returns a sorted copy of the row's
occurrences. `getMotionOccurrenceAt(page, layerId, time, {terminalPreview?})`
returns the covering occurrence, or `undefined` in a gap. The terminal preview
option uses left-limit presence only at the exact composition endpoint.

Only certified published composition identities retain the time-sorted index in
a WeakMap. Arbitrarily frozen inputs and mutable command drafts rebuild it so
an old cache cannot hide new placement. Published lookups binary-search exact
rational starts; changing a revision produces a new index. No per-frame UI sort
or history publication is necessary.

The timeline projects the canonical hierarchy once and places all occurrence
bars on that row. The clicked/selected occurrence ID takes priority for property
editing; otherwise the occurrence covering the playhead supplies the channels.
A gap does not silently select the first occurrence. Text editing, popovers and
key gestures keep their existing input ownership. Existing key IDs remain
unique across the whole document, so batch move/delete commands are unchanged.

Do not use a map that stores only one track per layer ID. Do not send an upsert
without trackId when a retained selection intends a different occurrence from
the one at the playhead. Composition-relative key placement is unchanged.

## Evaluation and export

Compilation keeps canonical layer order. Each occurrence is intersected with
the union of its ancestors' disjoint presence windows; this can produce several
compiled segments with the same canonical layer ID and trackId. Source PTS mapping
retains the occurrence's original start, not the clipped segment's start.

Evaluation emits each active canonical layer and media request once. Only the
corresponding occurrence's channels contribute values. The same frame plan
feeds preview, native Three compositing and exact Mediabunny export. Audio mixing
can consume the compiled disjoint segments without inventing another clock.
No document mutation, history event, asset read or pixel readback happens during
pure frame evaluation.

Compilation rejects more than 100,000 temporal segments explicitly. This bounds
ancestor-window expansion without adding a second visual object per occurrence.

## Verification scope

Focused Node tests cover v1 compatibility, promotion, independent IDs/channels,
exact adjacent boundaries, overlap rollback, source trim/move mapping, last-clip
deletion, Static, native-free repeated/random evaluation, ancestor gaps,
keyframe drafts, transition targeting, effect pruning, canonical duplication,
ID reservation after reopen and undo/redo. Strict core TypeScript and scoped
type-aware lint are checked independently. These pure tests do not claim browser
gesture, GPU correctness or performance acceptance for the new UI adapters.

Version 2 allows negative key timestamps as retained pre-roll. Moving or copying a
trimmed clip earlier therefore preserves the complete curve, including its
incoming easing, rather than clamping or baking off-range keys. Rational safe
integer/timebase bounds and the document-wide key budget still apply. Version 1
imports and commands keep the historical nonnegative-key rule. Preview can
sample the exact pose at zero; export still begins at frame zero and never emits
negative-time images. Signed channels survive serialization and undo/redo.

An explicit first `addMotionOccurrence` for an untracked legacy layer replaces
that layer's implicit full-duration presence with the requested interval; other
legacy implicit layers are materialized during the same promotion.
