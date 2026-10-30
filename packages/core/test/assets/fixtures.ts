import type { ImageAsset, VideoAsset, AudioAsset } from "../../src/assets/model";
export const image = (): ImageAsset => ({
  id: "photo",
  name: "Photo",
  mime: "image/png",
  width: 32,
  height: 16,
  dataUrl: "data:image/png;base64,AAAA",
});
export const video = (): VideoAsset => ({
  id: "video",
  kind: "video",
  name: "Video",
  mime: "video/mp4",
  width: 32,
  height: 16,
  originalId: "original-video",
  contentRevision: "revision-1",
  byteLength: 9,
  duration: { value: 5, rate: 1 },
  firstTimestamp: { value: -1, rate: 2 },
  timeResolution: 30000,
  orientation: { rotation: 0, flip: false, pixelAspectRatio: { numerator: 1, denominator: 1 } },
});

export const audio = (): AudioAsset => ({
  id: "audio",
  kind: "audio",
  name: "Pop",
  mime: "audio/wav",
  originalId: "audio-original",
  contentRevision: "audio-r1",
  byteLength: 16044,
  duration: { value: 4, rate: 1 },
  firstTimestamp: { value: 0, rate: 1 },
  timeResolution: 48000,
  sampleRate: 48000,
  channels: 1,
});
