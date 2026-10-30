import type { RefObject } from "react";
import { assetOriginalIdentity, isAudioAsset, type Asset } from "@musart/core";
import type { TimelineCanvasHost } from "./host";
import type { TimelineCanvasModel, TimelineCanvasSurface } from "./model";

/** Retain only envelopes whose canonical clip still resolves to the same immutable original. */
function retainWaveforms(previous: TimelineCanvasModel, next: TimelineCanvasModel) {
  const peaks = previous.waveformPeaks;
  if (
    !peaks?.size ||
    (previous.audioTracks === next.audioTracks && previous.assets === next.assets)
  )
    return peaks;
  const assetsFor = (model: TimelineCanvasModel) => {
    const assets = new Map<string, Asset>();
    let found = 0;
    for (const track of model.audioTracks) {
      if (!peaks.has(track.id)) continue;
      const asset = model.assets[track.assetId];
      if (asset) assets.set(track.id, asset);
      if (++found === peaks.size) break;
    }
    return assets;
  };
  const before = assetsFor(previous),
    after = assetsFor(next),
    retained = new Map<string, readonly number[]>();
  for (const [id, values] of peaks) {
    const a = before.get(id),
      b = after.get(id);
    if (
      a &&
      b &&
      isAudioAsset(a) &&
      isAudioAsset(b) &&
      assetOriginalIdentity(a) === assetOriginalIdentity(b)
    )
      retained.set(id, values);
  }
  return retained.size === peaks.size ? peaks : retained;
}

/** Presentation state stays outside React; only an explicit audio selection notifies label leaves. */
export function createTimelineCanvasHost(
  viewport: RefObject<HTMLDivElement | null>,
  root: RefObject<HTMLDivElement | null>,
  initial: TimelineCanvasModel,
) {
  let model = initial,
    native: TimelineCanvasSurface | null = null,
    audio: string | null = null;
  const listeners = new Set<() => void>();
  const facade: TimelineCanvasSurface = {
    update(next) {
      model = next;
      native?.update(model);
    },
    invalidate: () => native?.invalidate(),
    hitTest: (x, y) => native?.hitTest(x, y) ?? null,
    dispose() {
      native?.dispose();
      native = null;
      model = { ...model, waveformPeaks: undefined };
    },
  };
  const host: TimelineCanvasHost = {
    viewport,
    root,
    readHit(clientX, clientY) {
      const node = root.current;
      if (!native || !node) return null;
      const rect = node.getBoundingClientRect(),
        x = clientX - rect.left,
        y = clientY - rect.top;
      if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return null;
      return native.hitTest(x, y);
    },
    readModel: () => model,
    readSurface: () => (native ? facade : null),
    invalidate: () => native?.invalidate(),
    readSelectedAudio: () => audio,
    selectAudio(id) {
      if (id && !model.audioTracks.some((track) => track.id === id)) return;
      if (audio === id) return;
      audio = id;
      facade.update({ ...model, selectedAudioTrackIds: new Set(id ? [id] : []) });
      for (const listener of listeners) listener();
    },
    subscribeAudioSelection(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setAudioDraft: (audioDraft) => facade.update({ ...model, audioDraft }),
    setHoverHit: (hoverHit) => facade.update({ ...model, hoverHit }),
  };
  return {
    host,
    update(next: TimelineCanvasModel) {
      facade.update({
        ...next,
        selectedAudioTrackIds: model.selectedAudioTrackIds,
        draft: model.rows === next.rows ? model.draft : null,
        selectionPreview: model.rows === next.rows ? model.selectionPreview : null,
        audioDraft: model.audioTracks === next.audioTracks ? model.audioDraft : null,
        hoverHit: model.hoverHit,
        waveformPeaks: retainWaveforms(model, next),
      });
      if (
        audio &&
        (next.selectedLayerIds.size > 0 || !next.audioTracks.some((track) => track.id === audio))
      )
        host.selectAudio(null);
    },
    attach(surface: TimelineCanvasSurface) {
      if (native && native !== surface) native.dispose();
      native = surface;
      native.update(model);
    },
    detach(surface: TimelineCanvasSurface) {
      if (native !== surface) return;
      native = null;
      surface.dispose();
      model = { ...model, waveformPeaks: undefined };
    },
    waveforms: (peaks: ReadonlyMap<string, readonly number[]>) => {
      facade.update({ ...model, waveformPeaks: peaks });
    },
  };
}
