import {
  compileMotion,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  type AudioAsset,
} from "@musart/core";
import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from "mediabunny";
import {
  createMotionAudioMixer,
  exportMotionVideo,
  probeAudioOriginal,
} from "../../../packages/render/src/index";
import { StandaloneRenderer } from "../../../packages/render/src/export/standalone";

const windows = [
  [0, 0.012],
  [0.08, 0.12],
  [0.185, 0.2],
  [0.315, 0.37],
  [0.43, 0.5],
  [0.74, 0.78],
] as const;
function meters() {
  return windows.map(([first, after]) => ({ first, after, sum: 0, count: 0 }));
}
function add(meter: ReturnType<typeof meters>, time: number, value: number) {
  for (const window of meter)
    if (time >= window.first && time < window.after) {
      window.sum += value * value;
      window.count++;
    }
}
function rms(meter: ReturnType<typeof meters>) {
  return meter.map((window) => Math.sqrt(window.sum / Math.max(1, window.count)));
}
function originalTone() {
  const rate = 48000,
    bytes = new Uint8Array(44 + rate * 2),
    data = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++)
      bytes[offset + index] = value.charCodeAt(index);
  };
  text(0, "RIFF");
  data.setUint32(4, bytes.length - 8, true);
  text(8, "WAVEfmt ");
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, 1, true);
  data.setUint32(24, rate, true);
  data.setUint32(28, rate * 2, true);
  data.setUint16(32, 2, true);
  data.setUint16(34, 16, true);
  text(36, "data");
  data.setUint32(40, rate * 2, true);
  for (let index = 0; index < rate * 0.4; index++)
    data.setInt16(
      44 + index * 2,
      Math.round(Math.sin((index * 2 * Math.PI * 440) / rate) * 0.3 * 32767),
      true,
    );
  return new Blob([bytes], { type: "audio/wav" });
}
async function dataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(Error("Missing encoded bytes"));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** A real PCM original is processed headlessly; no editor presentation participates. */
export async function runMotionAudioProcessingWitness() {
  const wav = originalTone(),
    metadata = await probeAudioOriginal(wav);
  const asset: AudioAsset = {
    id: "tone",
    kind: "audio",
    name: "Tone then silence",
    originalId: "tone-original",
    contentRevision: "1",
    mime: wav.type,
    byteLength: wav.size,
    ...metadata,
  };
  const engine = new EditorEngine(
    createProject({
      assets: { [asset.id]: asset },
      pages: [
        createPage({
          id: "fx",
          width: 32,
          height: 32,
          layers: [
            createLayer("rectangle", {
              id: "visual",
              x: 0,
              y: 0,
              width: 32,
              height: 32,
              fill: "#2563eb",
            }),
          ],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  engine.execute({ type: "setMotionDuration", duration: { value: 4, rate: 5 } });
  const project = structuredClone(engine.getSnapshot().project),
    motion = project.pages[0]!.motion!;
  motion.frameRate = { numerator: 10, denominator: 1 };
  motion.audioTracks = [
    {
      id: "fade",
      name: "Fades",
      assetId: asset.id,
      start: { value: 0, rate: 1 },
      end: { value: 1, rate: 5 },
      sourceIn: { value: 0, rate: 1 },
      mute: false,
      volume: 0.5,
      processing: {
        fadeIn: { value: 1, rate: 20 },
        fadeOut: { value: 1, rate: 20 },
        reverb: { mix: 0, decay: 0.8 },
      },
    },
    {
      id: "room",
      name: "Finite room",
      assetId: asset.id,
      start: { value: 1, rate: 4 },
      end: { value: 11, rate: 20 },
      sourceIn: { value: 9, rate: 25 },
      mute: false,
      volume: 0.5,
      processing: {
        fadeIn: { value: 0, rate: 1 },
        fadeOut: { value: 0, rate: 1 },
        reverb: { mix: 1, decay: 0.12 },
      },
    },
    {
      id: "cut",
      name: "Composition cuts before authored fade",
      assetId: asset.id,
      start: { value: 3, rate: 5 },
      end: { value: 9, rate: 10 },
      sourceIn: { value: 0, rate: 1 },
      mute: false,
      volume: 0.5,
      processing: {
        fadeIn: { value: 0, rate: 1 },
        fadeOut: { value: 1, rate: 10 },
        reverb: { mix: 0, decay: 0.8 },
      },
    },
  ];
  const before = JSON.stringify(project),
    resolver = { resolveOriginal: async () => wav };
  const program = compileMotion(project, { compositionId: "fx" });
  const mixer = await createMotionAudioMixer(program, project.assets, resolver);
  const meter = meters(),
    seekStart = 15840,
    seekCount = 64;
  const expectedSeek: number[] = [];
  let seekMaxError = 0;
  try {
    for (let cursor = 0; cursor < mixer.samples; cursor += mixer.blockFrames) {
      const count = Math.min(mixer.blockFrames, mixer.samples - cursor),
        pcm = await mixer.readBlock(cursor, count);
      for (let index = 0; index < count; index++) {
        const frame = cursor + index;
        add(meter, frame / mixer.sampleRate, pcm[index]!);
        if (frame >= seekStart && frame < seekStart + seekCount) expectedSeek.push(pcm[index]!);
      }
    }
    const sought = await mixer.readBlock(seekStart, seekCount);
    for (let index = 0; index < seekCount; index++)
      seekMaxError = Math.max(seekMaxError, Math.abs(sought[index]! - expectedSeek[index]!));
  } finally {
    await mixer.dispose();
  }
  let backend: "webgpu" | "webgl" | null = null;
  const dispose = StandaloneRenderer.prototype.dispose;
  StandaloneRenderer.prototype.dispose = function () {
    backend = this.stats()?.backend ?? null;
    return dispose.call(this);
  };
  let result: Awaited<ReturnType<typeof exportMotionVideo>>;
  try {
    result = await exportMotionVideo(project, {
      compositionId: "fx",
      container: "webm",
      mediaResolver: resolver,
      videoBitrate: 1_000_000,
    });
  } finally {
    StandaloneRenderer.prototype.dispose = dispose;
  }
  if (!result.blob) throw Error("No processed export file");
  return {
    encoded: await dataUrl(result.blob),
    expectedRms: rms(meter),
    seekMaxError,
    backend,
    duration: result.duration,
    encodedDuration: result.encodedDuration,
    frameCount: result.frameCount,
    projectUnchanged: JSON.stringify(project) === before,
    readbacks: window.__musartVideoReadbacks,
    resources: (window as unknown as { __musartNativeVideo: object }).__musartNativeVideo,
  };
}

/** Decode checks run on a separate unprobed page, after the production path is finished. */
export async function inspectMotionAudioProcessing(encoded: string) {
  const input = new Input({
    source: new BlobSource(await (await fetch(encoded)).blob()),
    formats: ALL_FORMATS,
  });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw Error("Processed export has no audio track");
    const meter = meters();
    for await (const sample of new AudioSampleSink(track).samples()) {
      try {
        const data = new Float32Array(sample.numberOfFrames);
        sample.copyTo(data, { planeIndex: 0, format: "f32-planar" });
        for (let index = 0; index < data.length; index++)
          add(meter, sample.timestamp + index / sample.sampleRate, data[index]!);
      } finally {
        sample.close();
      }
    }
    return {
      rms: rms(meter),
      duration: await input.computeDuration(),
      codec: await track.getCodec(),
      channels: await track.getNumberOfChannels(),
      sampleRate: await track.getSampleRate(),
    };
  } finally {
    input.dispose();
  }
}
