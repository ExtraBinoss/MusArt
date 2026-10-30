import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  motionTimeToSeconds,
  type Asset,
  type AudioAsset,
  type VideoAsset,
} from "@musart/core";
import { MotionTransport } from "../../../apps/web/src/services/motion/transport";
import { MotionAudioPlayback } from "../../../apps/web/src/services/motion/audio/playback";
import { createWorkerAudioMixer } from "../../../apps/web/src/services/motion/audio/mixer-worker-client";
import { probeVideoOriginal } from "../../../packages/render/src/sources/video/probe";
import { VideoPlaybackCursor } from "../../../packages/render/src/sources/video/playback";
import { createVideoFixture } from "./video-source-witness";

function tone() {
  const rate = 48000,
    bytes = new Uint8Array(44 + rate * 2),
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
  view.setUint32(40, rate * 2, true);
  for (let i = 0; i < rate / 4; i++)
    view.setInt16(
      44 + i * 2,
      Math.round(Math.sin((i / rate) * 440 * Math.PI * 2) * 0.3 * 32767),
      true,
    );
  return new Blob([bytes], { type: "audio/wav" });
}
function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}
const meterCode = `registerProcessor('first-energy',class extends AudioWorkletProcessor {
 heard=false;
 process(inputs,outputs){const input=inputs[0]||[];const output=outputs[0]||[];for(let c=0;c<output.length;c++)if(input[c])output[c].set(input[c]);
 if(!this.heard&&input[0])for(let i=0;i<input[0].length;i++)if(Math.abs(input[0][i])>.001){this.heard=true;this.port.postMessage({at:currentTime+i/sampleRate,amplitude:input[0][i]});break;}return true;}
});`;

/** Real IndexedDB originals, native decoder worker, native audio graph and native video cursor. */
export async function prepareAudioPlaybackWitness(count = 40) {
  const original = await createVideoFixture(),
    info = await probeVideoOriginal(original.blob),
    wav = tone();
  const video: VideoAsset = {
    id: "movie",
    kind: "video",
    name: "Movie",
    mime: original.blob.type,
    originalId: "movie-original",
    contentRevision: "1",
    byteLength: original.blob.size,
    ...info,
  };
  const assets: Record<string, Asset> = { [video.id]: video };
  const tracks = Array.from({ length: count }, (_, index) => {
    const asset: AudioAsset = {
      id: `sound-${index}`,
      kind: "audio",
      name: "Tone",
      mime: wav.type,
      originalId: `sound-original-${index}`,
      contentRevision: "1",
      byteLength: wav.size,
      duration: { value: 1, rate: 1 },
      firstTimestamp: { value: 0, rate: 1 },
      timeResolution: 48000,
      sampleRate: 48000,
      channels: 1,
    };
    assets[asset.id] = asset;
    return {
      id: `clip-${index}`,
      name: "Tone",
      assetId: asset.id,
      start: { value: index, rate: 1 },
      end: { value: index + 1, rate: 1 },
      sourceIn: { value: 0, rate: 1 },
      volume: 1,
      mute: false,
    };
  });
  const movie = createLayer("video", {
    id: "movie-layer",
    assetId: video.id,
    width: 64,
    height: 64,
  });
  const engine = new EditorEngine(
    createProject({
      assets,
      pages: [
        createPage({
          id: "av",
          width: 64,
          height: 64,
          layers: [movie],
          motion: {
            version: 1,
            initialized: true,
            mode: "motion",
            duration: { value: count + 1, rate: 1 },
            frameRate: { numerator: 30, denominator: 1 },
            tracks: [
              {
                id: "movie-track",
                layerId: movie.id,
                start: { value: 0, rate: 1 },
                end: video.duration,
                properties: [],
              },
            ],
            audioTracks: tracks,
          },
        }),
      ],
    }),
  );
  const dbName = `audio-start-${crypto.randomUUID()}`,
    opening = indexedDB.open(dbName, 1);
  opening.onupgradeneeded = () => opening.result.createObjectStore("originals");
  const db = await request(opening),
    transaction = db.transaction("originals", "readwrite");
  transaction.objectStore("originals").put(original.blob, video.originalId);
  for (const asset of Object.values(assets))
    if (asset.kind === "audio") transaction.objectStore("originals").put(wav, asset.originalId);
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  const context = new AudioContext({ sampleRate: 48000, latencyHint: "interactive" });
  const meterUrl = URL.createObjectURL(new Blob([meterCode], { type: "text/javascript" }));
  try {
    await context.audioWorklet.addModule(meterUrl);
  } finally {
    URL.revokeObjectURL(meterUrl);
  }
  const meter = new AudioWorkletNode(context, "first-energy");
  meter.connect(context.destination);
  const transport = new MotionTransport(engine);
  transport.setPlaybackMode("once");
  const errors: string[] = [],
    reads: { assetId: string; at: number }[] = [],
    blocks: { start: number; count: number; at: number; ready: number }[] = [],
    starts: {
      wall: number;
      clock: number;
      when: number;
      offset: number;
      timeline: number;
      nonzero: boolean;
    }[] = [],
    frames: { time: number; pts: number; wall: number }[] = [];
  let playWall = 0,
    playClock = 0,
    openingMs = 0,
    activeNodes = 0,
    peakNodes = 0;
  let heard: {
    at: number;
    amplitude: number;
    received: number;
    timeline: number;
    videoTime: number;
  } | null = null;
  const createSource = context.createBufferSource.bind(context);
  context.createBufferSource = () => {
    const source = createSource(),
      connect = source.connect.bind(source),
      start = source.start.bind(source),
      disconnect = source.disconnect.bind(source);
    let connected = false;
    source.connect = ((destination: AudioNode) => {
      connected = true;
      activeNodes++;
      peakNodes = Math.max(peakNodes, activeNodes);
      return connect(destination === context.destination ? meter : destination);
    }) as typeof source.connect;
    source.disconnect = (() => {
      if (connected) {
        activeNodes--;
        connected = false;
      }
      disconnect();
    }) as typeof source.disconnect;
    source.start = (...args: Parameters<AudioBufferSourceNode["start"]>) => {
      starts.push({
        wall: performance.now() - playWall,
        clock: context.currentTime,
        when: args[0] ?? 0,
        offset: args[1] ?? 0,
        timeline: motionTimeToSeconds(transport.read().time),
        nonzero: !!source.buffer?.getChannelData(0).some((value) => Math.abs(value) > 0.001),
      });
      start(...args);
    };
    return source;
  };
  meter.port.onmessage = ({ data }) => {
    heard = {
      ...data,
      received: performance.now() - playWall,
      timeline: motionTimeToSeconds(transport.read().time),
      videoTime: frames.at(-1)?.time ?? 0,
    };
  };
  const playback = new MotionAudioPlayback(
    engine,
    transport,
    () => ({
      resolveOriginal: async (asset) => {
        reads.push({ assetId: asset.id, at: performance.now() - playWall });
        return request(
          db.transaction("originals").objectStore("originals").get(asset.originalId),
        ) as Promise<Blob>;
      },
    }),
    (error) => errors.push(String(error)),
    () => context,
    async (...args) => {
      const start = performance.now(),
        mixer = await createWorkerAudioMixer(...args);
      openingMs = performance.now() - start;
      return {
        ...mixer,
        get hasAudio() {
          return mixer.hasAudio;
        },
        async readBlock(start: number, count: number) {
          const block = { start, count, at: performance.now() - playWall, ready: 0 };
          blocks.push(block);
          try {
            return await mixer.readBlock(start, count);
          } finally {
            block.ready = performance.now() - playWall;
          }
        },
      };
    },
  );
  const cursor = new VideoPlaybackCursor({
    assetId: video.id,
    contentRevision: video.contentRevision,
    original: original.blob,
  });
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  document.body.append(canvas);
  let drawing: Promise<void> | null = null;
  const paint = () => {
    if (drawing) return;
    const time = transport.read().time;
    if (motionTimeToSeconds(time) >= motionTimeToSeconds(video.duration)) return;
    drawing = (async () => {
      const lease = await cursor.requestFrame(time);
      if (lease)
        try {
          canvas.getContext("2d")!.drawImage(lease.frame, 0, 0);
          frames.push({
            time: motionTimeToSeconds(time),
            pts: motionTimeToSeconds(lease.timestamp),
            wall: performance.now() - playWall,
          });
        } finally {
          lease.release();
        }
    })()
      .catch((error) => {
        errors.push(String(error));
      })
      .finally(() => {
        drawing = null;
      });
  };
  paint();
  await Promise.resolve(drawing);
  const stop = transport.subscribe(paint),
    canonical = engine.getSnapshot();
  const play = document.createElement("button");
  play.textContent = "Play AV witness";
  play.onclick = () => {
    frames.length = 0;
    playWall = performance.now();
    playClock = context.currentTime;
    transport.play();
  };
  document.body.append(play);
  return {
    read() {
      return {
        count,
        media: { videoCodec: original.codec, videoBytes: original.blob.size, audioBytes: wav.size },
        context: {
          sampleRate: context.sampleRate,
          baseLatency: context.baseLatency,
          outputLatency: context.outputLatency,
        },
        openingMs,
        heard,
        firstEnergyMs: heard ? (heard.at - playClock) * 1000 : null,
        playWall,
        playClock,
        reads,
        blocks,
        starts,
        frames,
        errors,
        peakNodes,
        activeNodes,
        video: cursor.stats(),
        timeline: motionTimeToSeconds(transport.read().time),
        canonicalUnchanged: engine.getSnapshot() === canonical,
      };
    },
    async close() {
      transport.pause();
      stop();
      await playback.dispose();
      transport.dispose();
      await drawing;
      await cursor.dispose();
      meter.disconnect();
      canvas.remove();
      play.remove();
      db.close();
      await request(indexedDB.deleteDatabase(dbName));
      return { activeNodes, video: cursor.stats() };
    },
  };
}
