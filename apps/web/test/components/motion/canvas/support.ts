import {
  createLayer,
  createPage,
  type MotionLayerTrack,
  type MotionAudioTrack,
} from "@musart/core";
import { vi } from "vitest";
import { projectTimelineRows } from "../../../../src/components/motion/tree";
import type { TimelineCanvasModel } from "../../../../src/components/motion/canvas/model";

export function canvasFixture() {
  const layer = createLayer("image", { id: "hero", name: "Hero", assetId: "photo" });
  const tracks: MotionLayerTrack[] = [
    {
      id: "first",
      layerId: layer.id,
      start: { value: 0, rate: 1 },
      end: { value: 1, rate: 1 },
      properties: [
        {
          id: "position",
          target: { kind: "layer", layerId: layer.id, property: "x" },
          keyframes: [
            { id: "a", time: { value: 0, rate: 1 }, value: 0 },
            { id: "b", time: { value: 1, rate: 1 }, value: 100, easing: { type: "hold" } },
          ],
        },
      ],
    },
    {
      id: "second",
      layerId: layer.id,
      start: { value: 2, rate: 1 },
      end: { value: 3, rate: 1 },
      properties: [],
    },
  ];
  const page = createPage({
    layers: [layer],
    motion: {
      version: 2,
      mode: "motion",
      initialized: true,
      duration: { value: 4, rate: 1 },
      frameRate: { numerator: 30, denominator: 1 },
      tracks,
    },
  });
  const rows = projectTimelineRows(page, new Set());
  const model: TimelineCanvasModel = {
    rows,
    audioTracks: [],
    assets: {},
    selectedLayerIds: new Set(),
    selectedKeyIds: new Set(),
    scale: 100,
    duration: 4,
    rowHeight: 24,
    gutter: 244,
  };
  const audio: MotionAudioTrack = {
    id: "sound",
    name: "Sound",
    assetId: "audio",
    start: { value: 0, rate: 1 },
    end: { value: 2, rate: 1 },
    sourceIn: { value: 1, rate: 2 },
    mute: false,
    volume: 1,
  };
  return { layer, tracks, page, rows, model, audio };
}

export function canvasContext() {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    setTransform: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    rect: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    lineWidth: 1,
  };
}
