import { motionTimeToSeconds } from "@musart/core";
import type { MotionAudioTrack, MotionLayerTrack } from "@musart/core";
import type { CanvasIndexedRow } from "./index";
import { timelineLowerBound } from "./intervals";
import type {
  TimelineCanvasClip,
  TimelineCanvasHit,
  TimelineCanvasModel,
  TimelineCanvasViewport,
} from "./model";

export function canvasTrackRange(
  track: MotionLayerTrack | MotionAudioTrack,
  model: TimelineCanvasModel,
  layerId?: string,
) {
  let start = motionTimeToSeconds(track.start),
    end = track.end ? motionTimeToSeconds(track.end) : model.duration;
  const draft = model.draft;
  const affected =
    draft &&
    (draft.trackId ? draft.trackId === track.id : !!layerId && draft.layerIds.has(layerId));
  if (affected) {
    const delta = motionTimeToSeconds(draft.delta);
    if (draft.action === "move" || draft.action === "trimStart") start += delta;
    if (draft.action === "move" || draft.action === "trimEnd") end += delta;
  }
  return { start, end };
}

export function projectCanvasClips(
  indexed: CanvasIndexedRow,
  rowIndex: number,
  model: TimelineCanvasModel,
  viewport: TimelineCanvasViewport,
) {
  const { row, tracks } = indexed;
  const start = viewport.left / model.scale,
    end = (viewport.left + viewport.width) / model.scale,
    margin = 9 / model.scale;
  const candidates = new Set(indexed.queryTracks(start - margin, end + margin));
  const draft = model.draft;
  if (draft && draft.action !== "keys") {
    const delta = motionTimeToSeconds(draft.delta);
    for (const track of indexed.queryTracks(start - delta - margin, end - delta + margin)) {
      if (draft.trackId ? track.id === draft.trackId : draft.layerIds.has(row.layer.id))
        candidates.add(track);
    }
    if (draft.trackId) {
      const affected = indexed.tracksById.get(draft.trackId);
      if (affected) candidates.add(affected);
    }
  }
  // Retain the immediate offscreen neighbors so a gap exposes its authored, full time interval.
  const before = timelineLowerBound(tracks, start, (track) => motionTimeToSeconds(track.start));
  const after = timelineLowerBound(tracks, end, (track) => motionTimeToSeconds(track.start));
  if (before > 0) candidates.add(tracks[before - 1]!);
  if (after < tracks.length) candidates.add(tracks[after]!);
  const ranges = [...candidates]
    .map((track) => ({ track, ...canvasTrackRange(track, model, row.layer.id) }))
    .sort((a, b) => a.start - b.start);
  const clips: TimelineCanvasClip[] = [];
  const gaps: Extract<TimelineCanvasHit, { kind: "gap" }>[] = [];
  const y = rowIndex * model.rowHeight - viewport.top;
  const base = { rowKey: row.key, rowIndex, layerId: row.layer.id };
  let previous = 0;
  const gap = (from: number, to: number) => {
    const left = Math.max(viewport.left, from * model.scale),
      right = Math.min(viewport.left + viewport.width, to * model.scale);
    if (right <= left) return;
    gaps.push({
      ...base,
      kind: "gap",
      start: from,
      end: to,
      bounds: { x: left - viewport.left, y, width: right - left, height: model.rowHeight },
    });
  };
  for (const entry of ranges) {
    const from = Math.max(0, entry.start),
      to = Math.min(model.duration, entry.end);
    gap(previous, from);
    previous = Math.max(previous, to);
    const x = from * model.scale - viewport.left,
      width = (to - from) * model.scale;
    if (width <= 0 || x + width < -9 || x > viewport.width + 9) continue;
    const bounds = {
      x,
      y: y + 3,
      width: Math.max(2, width),
      height: Math.max(2, model.rowHeight - 6),
    };
    const hit: TimelineCanvasHit = { ...base, kind: "clip", trackId: entry.track.id, bounds };
    const mediaKind =
      row.layer.kind === "image" || row.layer.kind === "video" ? row.layer.kind : "other";
    clips.push({
      kind: "clip",
      hit,
      bounds,
      selected: model.selectedLayerIds.has(row.layer.id),
      media: mediaKind !== "other",
      mediaKind,
      muted: row.layer.visible === false,
      label: row.layer.name,
      sourceIn: entry.track.media ? motionTimeToSeconds(entry.track.media.sourceIn) : 0,
      sourceDuration: 0,
      duration: to - from,
      trims: [
        { ...hit, kind: "trimStart", bounds: { ...bounds, x: x - 2, width: 6 } },
        { ...hit, kind: "trimEnd", bounds: { ...bounds, x: x + bounds.width - 4, width: 6 } },
      ],
    });
  }
  gap(previous, model.duration);
  return { clips, gaps };
}

export function projectCanvasAudio(
  track: MotionAudioTrack,
  rowIndex: number,
  model: TimelineCanvasModel,
  viewport: TimelineCanvasViewport,
): TimelineCanvasClip | null {
  const draft = model.audioDraft?.trackId === track.id ? model.audioDraft : null;
  const { start, end } = draft ?? canvasTrackRange(track, model);
  const x = start * model.scale - viewport.left,
    width = (end - start) * model.scale;
  if (width <= 0 || x + width < -9 || x > viewport.width + 9) return null;
  const bounds = {
    x,
    y: rowIndex * model.rowHeight - viewport.top + 3,
    width: Math.max(2, width),
    height: Math.max(2, model.rowHeight - 6),
  };
  const hit: TimelineCanvasHit = {
    kind: "audio",
    rowIndex,
    rowKey: track.id,
    trackId: track.id,
    bounds,
  };
  const asset = model.assets[track.assetId];
  const delta =
    model.draft?.trackId === track.id && model.draft.action === "trimStart"
      ? motionTimeToSeconds(model.draft.delta)
      : 0;
  return {
    kind: "audio",
    hit,
    bounds,
    selected: model.selectedAudioTrackIds?.has(track.id) ?? false,
    media: true,
    mediaKind: "audio",
    muted: track.mute,
    label: track.name,
    peaks: model.waveformPeaks?.get(track.id),
    sourceIn: draft?.sourceIn ?? motionTimeToSeconds(track.sourceIn) + delta,
    sourceDuration: asset?.kind === "audio" ? motionTimeToSeconds(asset.duration) : 0,
    duration: end - start,
    trims: [
      { ...hit, kind: "audioTrimStart", bounds: { ...bounds, x: x - 2, width: 6 } },
      { ...hit, kind: "audioTrimEnd", bounds: { ...bounds, x: x + bounds.width - 4, width: 6 } },
    ],
  };
}
