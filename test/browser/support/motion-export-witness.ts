import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  type AudioAsset,
  type VideoAsset,
} from "@musart/core";
import { AudioSampleSink, ALL_FORMATS, BlobSource, Input, VideoSampleSink } from "mediabunny";
import {
  exportMotionVideo,
  probeAudioOriginal,
  probeVideoOriginal,
} from "../../../packages/render/src/index";
import { createVideoFixture } from "./video-source-witness";
import { StandaloneRenderer } from "../../../packages/render/src/export/standalone";

function tone() {
  const rate = 44100,
    frames = rate / 2,
    bytes = new Uint8Array(44 + frames * 2),
    view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++) bytes[at + i] = value.charCodeAt(i);
  };
  text(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, frames * 2, true);
  for (let i = 0; i < frames; i++)
    view.setInt16(
      44 + i * 2,
      Math.round(Math.sin((i * Math.PI * 2 * 440) / rate) * 0.2 * 32767),
      true,
    );
  return new Blob([bytes], { type: "audio/wav" });
}
async function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Native file encoding returned no data URL."));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** No EditorEngine session is passed to rendering; it receives a portable project and native originals. */
export async function runMotionExportWitness(
  forceWebGL: boolean,
  container: "auto" | "webm" = "auto",
) {
  const original = await createVideoFixture(),
    wav = tone();
  const videoInfo = await probeVideoOriginal(original.blob),
    audioInfo = await probeAudioOriginal(wav);
  const video: VideoAsset = {
    id: "native-video",
    kind: "video",
    name: "Original colors",
    mime: original.blob.type,
    originalId: "native-color-v1",
    contentRevision: "v1",
    byteLength: original.blob.size,
    width: videoInfo.width,
    height: videoInfo.height,
    duration: videoInfo.duration,
    firstTimestamp: videoInfo.firstTimestamp,
    timeResolution: videoInfo.timeResolution,
    orientation: videoInfo.orientation,
  };
  const audio: AudioAsset = {
    id: "native-audio",
    kind: "audio",
    name: "Original tone",
    mime: wav.type,
    originalId: "native-tone-v1",
    contentRevision: "v1",
    byteLength: wav.size,
    ...audioInfo,
  };
  const movie = createLayer("video", {
    id: "movie",
    x: 0,
    y: 0,
    assetId: video.id,
    width: 64,
    height: 64,
  });
  const marker = createLayer("rectangle", {
    id: "marker",
    x: 0,
    y: 0,
    width: 8,
    height: 64,
    fill: "#ffffff",
  });
  const engine = new EditorEngine(
    createProject({
      assets: { [video.id]: video, [audio.id]: audio },
      pages: [
        createPage({
          id: "authored",
          name: "Authored export",
          width: 64,
          height: 64,
          layers: [movie, marker],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  engine.execute({ type: "setMotionDuration", duration: { value: 37, rate: 100 } });
  for (const [value, x] of [
    [0, 0],
    [37, 56],
  ] as const)
    engine.execute({
      type: "upsertMotionKeyframe",
      target: { kind: "layer", layerId: marker.id, property: "x" },
      time: { value, rate: 100 },
      value: x,
    });
  const project = structuredClone(engine.getSnapshot().project);
  project.pages[0]!.motion!.frameRate = { numerator: 30000, denominator: 1001 };
  project.pages[0]!.motion!.audioTracks = [
    {
      id: "muted-tone",
      name: "Muted original",
      assetId: audio.id,
      start: { value: 0, rate: 1 },
      end: { value: 4, rate: 100 },
      sourceIn: { value: 0, rate: 1 },
      mute: true,
      volume: 1,
    },
    {
      id: "tone-track",
      name: "Timed original tone",
      assetId: audio.id,
      start: { value: 8, rate: 100 },
      end: { value: 28, rate: 100 },
      sourceIn: { value: 0, rate: 1 },
      mute: false,
      volume: 0.5,
    },
    {
      id: "zero-volume-tone",
      name: "Zero volume original",
      assetId: audio.id,
      start: { value: 28, rate: 100 },
      end: { value: 37, rate: 100 },
      sourceIn: { value: 0, rate: 1 },
      mute: false,
      volume: 0,
    },
  ];
  const before = JSON.stringify(project),
    resolved: string[] = [],
    progress: number[] = [];
  let backend: "webgpu" | "webgl" | null = null;
  const dispose = StandaloneRenderer.prototype.dispose;
  StandaloneRenderer.prototype.dispose = function () {
    backend = this.stats()?.backend ?? null;
    return dispose.call(this);
  };
  let result: Awaited<ReturnType<typeof exportMotionVideo>>;
  try {
    result = await exportMotionVideo(project, {
      container,
      compositionId: "authored",
      forceWebGL,
      videoBitrate: 1_000_000,
      audioBitrate: 192_000,
      mediaResolver: {
        async resolveOriginal(asset) {
          resolved.push(asset.id);
          return asset.id === video.id ? original.blob : wav;
        },
      },
      onProgress: (value) => {
        progress.push(value.fraction);
      },
    });
  } finally {
    StandaloneRenderer.prototype.dispose = dispose;
  }
  if (!result.blob) throw new Error("Expected a native encoded output file");
  const abort = new AbortController();
  let cancelled = false;
  try {
    await exportMotionVideo(project, {
      compositionId: "authored",
      forceWebGL,
      audio: false,
      mediaResolver: { resolveOriginal: async () => original.blob },
      signal: abort.signal,
      onProgress: (value) => {
        if (value.completedFrames >= 1) abort.abort();
      },
    });
  } catch (error) {
    if (!abort.signal.aborted || error !== abort.signal.reason) throw error;
    cancelled = true;
  }
  if (!cancelled) throw new Error("Cancelled export unexpectedly completed");
  return {
    ...result,
    backend,
    cancelled,
    blob: undefined,
    encoded: await dataUrl(result.blob),
    resolved,
    progress,
    projectUnchanged: JSON.stringify(project) === before,
    readbacks: window.__musartVideoReadbacks,
    resources: (window as unknown as { __musartNativeVideo: object }).__musartNativeVideo,
    userAgent: navigator.userAgent,
  };
}

/** Decoded verification lives on a different unprobed page; these reads never enter production. */
export async function inspectMotionFile(encoded: string) {
  const blob = await (await fetch(encoded)).blob();
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack(),
      audio = await input.getPrimaryAudioTrack();
    if (!video || !audio) throw new Error("The delivered file must contain both real tracks");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const context = canvas.getContext("2d")!;
    const frames: { timestamp: number; duration: number; center: number[]; left: number[] }[] = [];
    for await (const sample of new VideoSampleSink(video).samples()) {
      try {
        sample.draw(context, 0, 0);
        frames.push({
          timestamp: sample.timestamp,
          duration: sample.duration,
          center: [...context.getImageData(32, 32, 1, 1).data],
          left: [...context.getImageData(4, 32, 1, 1).data],
        });
      } finally {
        sample.close();
      }
    }
    const windows = [
      { first: 0, after: 0.04, sum: 0, count: 0 },
      { first: 0.13, after: 0.23, sum: 0, count: 0 },
      { first: 0.33, after: 0.37, sum: 0, count: 0 },
    ];
    for await (const sample of new AudioSampleSink(audio).samples()) {
      try {
        const data = new Float32Array(sample.numberOfFrames);
        sample.copyTo(data, { planeIndex: 0, format: "f32-planar" });
        for (let i = 0; i < data.length; i++) {
          const time = sample.timestamp + i / sample.sampleRate;
          for (const window of windows)
            if (time >= window.first && time < window.after) {
              window.sum += data[i]! ** 2;
              window.count++;
            }
        }
      } finally {
        sample.close();
      }
    }
    return {
      duration: await input.computeDuration(),
      width: await video.getDisplayWidth(),
      height: await video.getDisplayHeight(),
      videoCodec: await video.getCodec(),
      timeResolution: await video.getTimeResolution(),
      audioCodec: await audio.getCodec(),
      sampleRate: await audio.getSampleRate(),
      channels: await audio.getNumberOfChannels(),
      frames,
      audioRms: windows.map((window) => Math.sqrt(window.sum / Math.max(1, window.count))),
    };
  } finally {
    input.dispose();
  }
}
