import {
  createPage,
  createProject,
  EditorEngine,
  type AudioAsset,
  type MotionAudioTrack,
} from "@musart/core";
export function audioFixture(count = 1) {
  const asset: AudioAsset = {
    id: "sound",
    kind: "audio",
    name: "Sound",
    mime: "audio/wav",
    originalId: "original",
    contentRevision: "r1",
    byteLength: 1,
    duration: { value: 2, rate: 1 },
    firstTimestamp: { value: 0, rate: 1 },
    timeResolution: 48000,
    sampleRate: 48000,
    channels: 1,
  };
  const tracks: MotionAudioTrack[] = Array.from({ length: count }, (_, i) => ({
    id: `audio-${i}`,
    name: `Sound ${i}`,
    assetId: asset.id,
    start: { value: 0, rate: 1 },
    end: { value: 2, rate: 1 },
    sourceIn: { value: 0, rate: 1 },
    mute: false,
    volume: 1,
  }));
  const engine = new EditorEngine(
    createProject({
      assets: { sound: asset },
      pages: [
        createPage({
          id: "page",
          layers: [],
          motion: {
            version: 1,
            mode: "motion",
            initialized: true,
            duration: { value: 3, rate: 1 },
            frameRate: { numerator: 30, denominator: 1 },
            tracks: [],
            audioTracks: tracks,
          },
        }),
      ],
    }),
  );
  const page = () => engine.getSnapshot().project.pages[0]!;
  return { engine, asset, page, track: () => page().motion!.audioTracks![0]! };
}
