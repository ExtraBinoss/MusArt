import { expect, it } from "vitest";
import { paintTimelineCanvas } from "../../../../src/components/motion/canvas/paint";
import { projectTimelineCanvas } from "../../../../src/components/motion/canvas/projection";
import type { TimelineCanvasPalette } from "../../../../src/components/motion/canvas/model";
import { canvasContext, canvasFixture } from "./support";

const palette: TimelineCanvasPalette = {
  background: "#fff",
  foreground: "#111",
  muted: "#777",
  border: "#ccc",
  track: "#eee",
  trackHover: "#ddd",
  trackSelected: "#333",
  keySelected: "#00f",
  image: "#00f",
  video: "#80f",
  audio: "#080",
};
it("draws neutral clips, selected keys and hold glyphs using only bounded native drawing", () => {
  const d = canvasFixture(),
    context = canvasContext();
  const scene = projectTimelineCanvas(
    { ...d.model, selectedLayerIds: new Set(["hero"]), selectedKeyIds: new Set(["b"]) },
    { left: 0, top: 0, width: 400, height: 48 },
  );
  paintTimelineCanvas(context as unknown as CanvasRenderingContext2D, scene, palette);
  expect(context.clearRect).toHaveBeenCalledExactlyOnceWith(0, 0, 400, 48);
  expect(context.roundRect).toHaveBeenCalledWith(0, 3, 100, 18, 4);
  expect(context.moveTo).toHaveBeenCalledWith(100, 32);
  expect(context.lineTo).toHaveBeenCalled();
  expect(context.save).toHaveBeenCalledTimes(context.restore.mock.calls.length);
});
it("fills a symmetric two-tone mountain using only the visible waveform contour", () => {
  const d = canvasFixture(),
    context = canvasContext();
  const fills: { color: string; alpha: number }[] = [];
  context.fill.mockImplementation(() => {
    fills.push({ color: context.fillStyle, alpha: context.globalAlpha });
  });
  const audio = { ...d.audio, start: { value: 0, rate: 1 }, end: { value: 100, rate: 1 } };
  const scene = projectTimelineCanvas(
    {
      ...d.model,
      duration: 100,
      audioTracks: [audio],
      assets: {
        audio: {
          kind: "audio",
          id: "audio",
          name: "Sound",
          mime: "audio/wav",
          originalId: "original",
          contentRevision: "1",
          byteLength: 100,
          duration: { value: 110, rate: 1 },
          firstTimestamp: { value: 0, rate: 1 },
          timeResolution: 48000,
          sampleRate: 48000,
          channels: 2,
        },
      },
      waveformPeaks: new Map([["sound", Array.from({ length: 2048 }, () => 0.5)]]),
    },
    { left: 3000, top: 48, width: 100, height: 24 },
  );
  paintTimelineCanvas(context as unknown as CanvasRenderingContext2D, scene, palette);
  expect(context.moveTo).toHaveBeenCalledTimes(2);
  expect(context.moveTo).toHaveBeenCalledWith(0, 12);
  expect(context.closePath).toHaveBeenCalledTimes(2);
  expect(context.quadraticCurveTo).toHaveBeenCalledTimes(200);
  expect(context.lineTo).toHaveBeenCalledWith(0, 8);
  expect(context.lineTo).toHaveBeenCalledWith(100, 16);
  expect(context.lineTo).toHaveBeenCalledWith(0, expect.closeTo(9.2));
  expect(context.lineTo).toHaveBeenCalledWith(100, expect.closeTo(14.8));
  expect(fills).toEqual([
    { color: palette.track, alpha: 1 },
    { color: palette.muted, alpha: 0.38 },
    { color: palette.muted, alpha: 0.72 },
  ]);
  expect(context.stroke).toHaveBeenCalledTimes(1);
  expect(context.roundRect.mock.calls[0]?.slice(0, 3)).toEqual([-8, 3, 116]);
});
it("keeps live connectors while the small interpolation glyph is faded out", () => {
  const d = canvasFixture();
  d.tracks[0]!.properties[0]!.keyframes[1]!.easing = { type: "linear" };
  const scene = projectTimelineCanvas(d.model, { left: 0, top: 0, width: 200, height: 48 });
  const hidden = canvasContext(),
    shown = canvasContext();
  paintTimelineCanvas(hidden as unknown as CanvasRenderingContext2D, scene, palette, 0);
  paintTimelineCanvas(shown as unknown as CanvasRenderingContext2D, scene, palette, 1);
  expect(hidden.bezierCurveTo).not.toHaveBeenCalled();
  expect(shown.bezierCurveTo).toHaveBeenCalled();
  expect(hidden.moveTo).toHaveBeenCalledWith(5, 36);
  expect(hidden.lineTo).toHaveBeenCalledWith(95, 36);
});
