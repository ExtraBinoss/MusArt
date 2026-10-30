import { expect, it, vi } from "vitest";
import { createTimelineCanvasHost } from "../../../../src/components/motion/canvas/host-state";
import type {
  TimelineCanvasHit,
  TimelineCanvasModel,
} from "../../../../src/components/motion/canvas/model";
import { audioFixture } from "../../../support/audio";

function fixture() {
  const d = audioFixture(2),
    viewport = { current: document.createElement("div") },
    root = { current: document.createElement("div") },
    model: TimelineCanvasModel = {
      rows: [],
      audioTracks: d.page().motion!.audioTracks!,
      assets: d.engine.getSnapshot().project.assets,
      selectedLayerIds: new Set(),
      selectedKeyIds: new Set(),
      scale: 120,
      duration: 3,
      rowHeight: 24,
      gutter: 244,
    };
  vi.spyOn(root.current, "getBoundingClientRect").mockReturnValue({
    left: 100,
    top: 200,
    width: 300,
    height: 180,
  } as DOMRect);
  const hit: TimelineCanvasHit = {
    kind: "audio",
    trackId: "audio-0",
    rowKey: "audio-0",
    rowIndex: 0,
    bounds: { x: 0, y: 0, width: 100, height: 24 },
  };
  const surface = () => ({
    update: vi.fn(),
    invalidate: vi.fn(),
    hitTest: vi.fn(() => hit),
    dispose: vi.fn(),
  });
  return {
    ...d,
    viewport,
    root,
    model,
    hit,
    surface,
    binding: createTimelineCanvasHost(viewport, root, model),
  };
}
it("converts native pointer coordinates into the same live surface and rejects retired or outside targets", () => {
  const d = fixture(),
    surface = d.surface();
  expect(d.binding.host.readHit(110, 210)).toBeNull();
  d.binding.attach(surface);
  expect(surface.update).toHaveBeenCalledWith(d.model);
  expect(d.binding.host.readHit(110, 210)).toBe(d.hit);
  expect(surface.hitTest).toHaveBeenLastCalledWith(10, 10);
  expect(d.binding.host.readHit(99, 210)).toBeNull();
  expect(d.binding.host.readHit(400, 210)).toBeNull();
  expect(d.binding.host.readHit(110, 380)).toBeNull();
  d.binding.host.invalidate();
  expect(surface.invalidate).toHaveBeenCalledOnce();
  d.binding.detach(surface);
  expect(surface.dispose).toHaveBeenCalledOnce();
  expect(d.binding.host.readSurface()).toBeNull();
});
it("shares imperative drafts, hover and prepared peaks without notifying label subscribers on frames", () => {
  const d = fixture(),
    surface = d.surface(),
    notify = vi.fn();
  d.binding.attach(surface);
  const stop = d.binding.host.subscribeAudioSelection(notify);
  d.binding.host.setHoverHit(d.hit);
  d.binding.host.setAudioDraft({ trackId: "audio-0", start: 0.2, end: 1, sourceIn: 0.2 });
  const peaks = new Map([["audio-0", [0, 0.7, 0]]]);
  d.binding.waveforms(peaks);
  expect(d.binding.host.readModel()).toMatchObject({
    hoverHit: d.hit,
    waveformPeaks: peaks,
    audioDraft: { start: 0.2 },
  });
  expect(notify).not.toHaveBeenCalled();
  d.binding.host.selectAudio("audio-0");
  d.binding.host.selectAudio("audio-0");
  d.binding.host.selectAudio("missing");
  expect(notify).toHaveBeenCalledOnce();
  expect(d.binding.host.readSelectedAudio()).toBe("audio-0");
  expect(d.binding.host.readModel().selectedAudioTrackIds).toEqual(new Set(["audio-0"]));
  d.binding.update({ ...d.model, scale: 240 });
  expect(d.binding.host.readModel().waveformPeaks).toBe(peaks);
  expect(d.binding.host.readModel().audioDraft?.start).toBe(0.2);
  d.binding.update({ ...d.model, selectedLayerIds: new Set(["visual"]) });
  expect(d.binding.host.readSelectedAudio()).toBeNull();
  expect(notify).toHaveBeenCalledTimes(2);
  stop();
  d.binding.host.selectAudio("audio-1");
  expect(notify).toHaveBeenCalledTimes(2);
  d.binding.detach(surface);
});
it("clears removed authored drafts and cannot let stale detachment retire a replacement surface", () => {
  const d = fixture(),
    a = d.surface(),
    b = d.surface();
  d.binding.attach(a);
  const draft = {
    action: "keys" as const,
    delta: { value: 1, rate: 2 },
    layerIds: new Set<string>(),
    keyIds: new Set(["key"]),
  };
  d.binding.host.readSurface()!.update({ ...d.model, draft });
  d.binding.host.setAudioDraft({ trackId: "audio-0", start: 0.2, end: 1, sourceIn: 0.2 });
  d.binding.host.selectAudio("audio-0");
  d.binding.update({ ...d.model, rows: [], audioTracks: [] });
  expect(d.binding.host.readModel().draft).toBeNull();
  expect(d.binding.host.readModel().audioDraft).toBeNull();
  expect(d.binding.host.readSelectedAudio()).toBeNull();
  d.binding.attach(b);
  expect(a.dispose).toHaveBeenCalledOnce();
  d.binding.detach(a);
  expect(b.dispose).not.toHaveBeenCalled();
  d.binding.host.readSurface()!.dispose();
  expect(b.dispose).toHaveBeenCalledOnce();
});
it("removes same-ID stale audio envelopes synchronously before painting a replaced original", () => {
  const d = fixture(),
    surface = d.surface(),
    peaks = new Map([["audio-0", [0, 0.7, 0]]]);
  d.binding.attach(surface);
  d.binding.waveforms(peaks);
  const old = d.binding.host.readModel();
  const replaced = {
    ...old,
    assets: { ...old.assets, sound: { ...d.asset, contentRevision: "different-original" } },
  };
  d.binding.update(replaced);
  expect(d.binding.host.readModel().waveformPeaks?.size).toBe(0);
  expect(surface.update).toHaveBeenLastCalledWith(
    expect.objectContaining({ assets: replaced.assets, waveformPeaks: new Map() }),
  );
  d.binding.detach(surface);
});
it("keeps unchanged originals across unrelated edits and drops only clips assigned to another original", () => {
  const d = fixture(),
    surface = d.surface(),
    a = [0, 0.7, 0],
    b = [0, 0.4, 0],
    peaks = new Map([
      ["audio-0", a],
      ["audio-1", b],
    ]);
  d.binding.attach(surface);
  d.binding.waveforms(peaks);
  const copied = {
    ...d.model,
    assets: { ...d.model.assets, sound: { ...d.asset, name: "Renamed original" } },
    audioTracks: d.model.audioTracks.map((track) => ({ ...track, volume: 0.5 })),
  };
  d.binding.update(copied);
  expect(d.binding.host.readModel().waveformPeaks).toBe(peaks);
  const replacement = { ...d.asset, id: "replacement", originalId: "another-original" },
    next = {
      ...copied,
      assets: { ...copied.assets, replacement },
      audioTracks: copied.audioTracks.map((track) =>
        track.id === "audio-0" ? { ...track, assetId: replacement.id } : track,
      ),
    };
  d.binding.update(next);
  expect(d.binding.host.readModel().waveformPeaks).toEqual(new Map([["audio-1", b]]));
  expect(d.binding.host.readModel().waveformPeaks?.get("audio-1")).toBe(b);
  d.binding.detach(surface);
  expect(d.binding.host.readModel().waveformPeaks).toBeUndefined();
  const fresh = d.surface();
  d.binding.attach(fresh);
  expect(fresh.update).toHaveBeenLastCalledWith(
    expect.objectContaining({ waveformPeaks: undefined }),
  );
  d.binding.detach(fresh);
});
