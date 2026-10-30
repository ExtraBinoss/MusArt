import { afterEach, expect, it, vi } from "vitest";
import { createPage, createProject, EditorEngine, type AudioAsset } from "@musart/core";
import { MotionTransport } from "../../../../src/services/motion/transport";
import { MotionAudioPlayback } from "../../../../src/services/motion/audio/playback";
const state = vi.hoisted(() => ({
  mix: vi.fn(),
  read: vi.fn(),
  dispose: vi.fn(),
  volume: vi.fn(),
  mixState: vi.fn(),
}));
vi.mock("../../../../src/services/motion/audio/mixer-worker-client", () => ({
  createWorkerAudioMixer: state.mix,
}));
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
function setup() {
  vi.useFakeTimers();
  const asset: AudioAsset = {
    id: "sound",
    name: "Sound",
    kind: "audio",
    mime: "audio/wav",
    originalId: "o",
    contentRevision: "r",
    byteLength: 1,
    duration: { value: 1, rate: 1 },
    firstTimestamp: { value: 0, rate: 1 },
    timeResolution: 48000,
    sampleRate: 48000,
    channels: 1,
  };
  const engine = new EditorEngine(
    createProject({
      assets: { sound: asset },
      pages: [
        createPage({
          id: "page",
          layers: [],
          motion: {
            version: 1,
            initialized: true,
            mode: "motion",
            duration: { value: 1, rate: 1 },
            frameRate: { numerator: 30, denominator: 1 },
            tracks: [],
            audioTracks: [
              {
                id: "clip",
                name: "Sound",
                assetId: "sound",
                start: { value: 0, rate: 1 },
                end: { value: 1, rate: 1 },
                sourceIn: { value: 0, rate: 1 },
                volume: 1,
                mute: false,
              },
            ],
          },
        }),
      ],
    }),
  );
  const scheduler = { now: vi.fn(() => 0), request: vi.fn(() => 1), cancel: vi.fn() };
  const transport = new MotionTransport(engine, scheduler),
    errors = vi.fn();
  const nodes: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
    buffer: AudioBuffer | null;
  }[] = [];
  const buffers: { copyToChannel: ReturnType<typeof vi.fn> }[] = [];
  const context = {
    sampleRate: 48000,
    currentTime: 0,
    destination: {},
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    createBuffer: vi.fn(() => {
      const buffer = { copyToChannel: vi.fn() };
      buffers.push(buffer);
      return buffer;
    }),
    createBufferSource: vi.fn(() => {
      const source = {
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
        connect: vi.fn(),
        onended: null,
        buffer: null,
      };
      nodes.push(source);
      return source;
    }),
  };
  state.read
    .mockReset()
    .mockImplementation(async (_start, count: number) => new Float32Array(count * 2).fill(0.1));
  state.dispose.mockReset().mockResolvedValue(undefined);
  state.volume.mockReset().mockResolvedValue(undefined);
  state.mixState.mockReset().mockResolvedValue(undefined);
  state.mix.mockReset().mockResolvedValue({
    sampleRate: 48000,
    channels: 2,
    samples: 48000,
    blockFrames: 1024,
    hasAudio: true,
    setVolumePreview: state.volume,
    setMixState: state.mixState,
    readBlock: state.read,
    dispose: state.dispose,
  });
  const playback = new MotionAudioPlayback(
    engine,
    transport,
    () => ({ resolveOriginal: async () => new Blob(["x"]) }),
    errors,
    () => context as unknown as AudioContext,
  );
  const flush = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };
  return { playback, engine, transport, errors, context, nodes, buffers, flush };
}
it("schedules original PCM with the native clock without document commands or RAF work", async () => {
  const d = setup(),
    commands = vi.fn();
  d.engine.subscribeCommands(commands);
  d.transport.play();
  expect(d.context.resume).toHaveBeenCalledOnce();
  await d.flush();
  expect(state.mix).toHaveBeenCalledOnce();
  expect(state.mix.mock.calls[0]![0].audio).toHaveLength(1);
  expect(d.nodes.length).toBeGreaterThan(0);
  expect(d.nodes.length).toBeLessThanOrEqual(3);
  expect(state.mix.mock.calls[0]![3]).toMatchObject({ blockFrames: 1024 });
  const lastStart = d.nodes.at(-1)!.start.mock.calls[0]![0] as number;
  expect(lastStart + 1024 / 48000 - d.context.currentTime).toBeLessThanOrEqual(0.062);
  expect(d.nodes[0]!.start).toHaveBeenCalledWith(0.01, 0);
  expect(d.buffers[0]!.copyToChannel).toHaveBeenCalledTimes(2);
  expect(commands).not.toHaveBeenCalled();
  d.transport.pause();
  expect(
    d.nodes.every(
      (node) => node.stop.mock.calls.length === 1 && node.disconnect.mock.calls.length === 1,
    ),
  ).toBe(true);
  await d.playback.dispose();
  expect(d.context.close).toHaveBeenCalledOnce();
  expect(state.dispose).toHaveBeenCalledOnce();
  d.transport.dispose();
});
it("retires a late mixer after pause without scheduling stale samples", async () => {
  const d = setup();
  let release!: (value: unknown) => void;
  state.mix.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  d.transport.play();
  await d.flush();
  d.transport.pause();
  release({
    sampleRate: 48000,
    channels: 2,
    samples: 48000,
    blockFrames: 1024,
    hasAudio: true,
    setVolumePreview: state.volume,
    setMixState: state.mixState,
    readBlock: state.read,
    dispose: state.dispose,
  });
  await d.flush();
  expect(d.nodes).toHaveLength(0);
  expect(state.dispose).toHaveBeenCalledOnce();
  expect(d.errors).not.toHaveBeenCalled();
  await d.playback.dispose();
  d.transport.dispose();
});
it("stops playback and reports a real decoding failure instead of pretending audio played", async () => {
  const d = setup();
  state.read.mockRejectedValueOnce(Error("audio decoder failed"));
  d.transport.play();
  await d.flush();
  expect(d.transport.read().playing).toBe(false);
  expect(d.errors).toHaveBeenCalledWith(
    expect.objectContaining({ message: "audio decoder failed" }),
  );
  expect(d.nodes).toHaveLength(0);
  await d.playback.dispose();
  d.transport.dispose();
});

it("rebases committed volume/mute and undo while keeping Play and its worker instance", async () => {
  const d = setup();
  d.transport.play();
  await d.flush();
  const before = d.transport.read();
  d.engine.execute({ type: "updateMotionAudioTrack", trackId: "clip", patch: { volume: 0.4 } });
  await d.flush();
  expect(d.transport.read().playing).toBe(true);
  expect(d.transport.read().time).toBe(before.time);
  expect(state.mix).toHaveBeenCalledOnce();
  expect(state.dispose).not.toHaveBeenCalled();
  expect(state.mixState).toHaveBeenLastCalledWith("clip", { volume: 0.4, mute: false });
  d.engine.execute({ type: "updateMotionAudioTrack", trackId: "clip", patch: { mute: true } });
  await d.flush();
  expect(d.transport.read().playing).toBe(true);
  expect(state.mixState).toHaveBeenLastCalledWith("clip", { volume: 0.4, mute: true });
  d.engine.undo();
  await d.flush();
  expect(d.transport.read().playing).toBe(true);
  expect(state.mix).toHaveBeenCalledOnce();
  d.transport.pause();
  await d.playback.dispose();
  d.transport.dispose();
});
it.each([{ volume: 0 }, { mute: true }])(
  "bootstraps audio lazily after an initially silent Play becomes audible: %j",
  async (patch) => {
    const d = setup();
    d.engine.execute({ type: "updateMotionAudioTrack", trackId: "clip", patch });
    d.transport.play();
    await d.flush();
    expect(state.mix).not.toHaveBeenCalled();
    const time = d.transport.read().time;
    d.engine.execute({
      type: "updateMotionAudioTrack",
      trackId: "clip",
      patch: { volume: 0.5, mute: false },
    });
    await d.flush();
    expect(d.transport.read().playing).toBe(true);
    expect(d.transport.read().time).toBe(time);
    expect(state.mix).toHaveBeenCalledOnce();
    expect(d.nodes.length).toBeGreaterThan(0);
    d.transport.pause();
    await d.playback.dispose();
    d.transport.dispose();
  },
);
