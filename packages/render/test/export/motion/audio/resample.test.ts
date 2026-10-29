import { expect, it } from "vitest";
import { sampleMotionPcm } from "../../../../src/export/motion/audio/resample";
import type { MotionPcmChunk } from "../../../../src/export/motion/audio/model";

it("interpolates native PCM packets across contiguous boundaries and leaves genuine gaps silent", () => {
  const chunks: MotionPcmChunk[] = [
    { timestamp: 0, sampleRate: 8000, frames: 2, channels: [new Float32Array([0, 1])] },
    { timestamp: 2 / 8000, sampleRate: 8000, frames: 2, channels: [new Float32Array([0, -1])] },
  ];
  expect(sampleMotionPcm(chunks, 0.5 / 8000, 0, 2)).toBe(0.5);
  expect(sampleMotionPcm(chunks, 1.5 / 8000, 1, 2)).toBe(0.5);
  expect(sampleMotionPcm(chunks, -1, 0, 2)).toBe(0);
  expect(sampleMotionPcm(chunks, 1, 0, 2)).toBe(0);
  const gap = [chunks[0]!, { ...chunks[1]!, timestamp: 4 / 8000 }];
  expect(sampleMotionPcm(gap, 3 / 8000, 0, 2)).toBe(0);
  expect(sampleMotionPcm(gap, 1.5 / 8000, 0, 2)).toBe(1);
});
it("maps mono to stereo and stereo to mono without hidden normalization", () => {
  const stereo: MotionPcmChunk = {
    timestamp: 0,
    sampleRate: 8000,
    frames: 2,
    channels: [new Float32Array([1, 1]), new Float32Array([-0.5, -0.5])],
  };
  expect(sampleMotionPcm([stereo], 0, 0, 1)).toBe(0.25);
  expect(sampleMotionPcm([stereo], 0, 1, 2)).toBe(-0.5);
});
