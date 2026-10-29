import type { MotionTemplateMedia } from "../../src/services/projects/templates/motion/model";

export function templateMedia(): MotionTemplateMedia {
  return {
    photos: Array.from({ length: 3 }, (_, index) => ({
      id: `photo-${index}`,
      kind: "image",
      name: `Stock ${index + 1}`,
      mime: "image/png",
      width: 1,
      height: 1,
      dataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0n0AAAAASUVORK5CYII=",
    })),
    video: {
      id: "flower-video",
      kind: "video",
      name: "Flower",
      mime: "video/mp4",
      width: 960,
      height: 540,
      originalId: "original-flower",
      contentRevision: "sha256:test-video",
      byteLength: 9,
      duration: { value: 1001, rate: 200 },
      firstTimestamp: { value: 0, rate: 1 },
      timeResolution: 30000,
      orientation: { rotation: 0, flip: false, pixelAspectRatio: { numerator: 1, denominator: 1 } },
    },
  };
}
