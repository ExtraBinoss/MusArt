import { compileMotion, motionTimeToSeconds, type EnginePort } from "@musart/core";
import type { MediaSourceResolver } from "@musart/render";
import { createWorkerAudioMixer } from "./mixer-worker-client";
import type { AudioMixPublication } from "./commit-policy";
import type { MotionTransport } from "../transport";
type Mixer = Awaited<ReturnType<typeof createWorkerAudioMixer>>;

/** Native audio clock + bounded PCM lookahead. No React state, frame loop or document commands. */
export class MotionAudioPlayback {
  private context: AudioContext | null = null;
  private mixer: Mixer | null = null;
  private controller: AbortController | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly nodes = new Set<AudioBufferSourceNode>();
  private generation = 0;
  private busy = false;
  private playing = false;
  private lastTime = 0;
  private direction = 1;
  private firstTime = 0;
  private firstClock = 0;
  private nextSample = 0;
  private stop: (() => void) | null;
  private closed = false;
  private readonly volumeDrafts = new Map<string, number>();
  private readonly pendingVolumes = new Map<string, number | null>();
  private volumeFrame: number | null = null;
  private scheduling = false;
  private scopeProject = "";
  private scopeComposition = "";
  private mixPublication: AudioMixPublication | null = null;
  private readonly authoredMix = new Map<string, { volume: number; mute: boolean }>();
  private opening: Promise<Mixer> | null = null;
  private retiring: Promise<void> = Promise.resolve();
  constructor(
    private readonly engine: EnginePort,
    private readonly transport: MotionTransport,
    private readonly resolver: (projectId: string) => MediaSourceResolver,
    private readonly onError: (error: unknown) => void,
    private readonly createContext = () =>
      new AudioContext({ sampleRate: 48000, latencyHint: "interactive" }),
    private readonly createMixer = createWorkerAudioMixer,
  ) {
    this.scopeProject = engine.getSnapshot().project.id;
    this.scopeComposition = transport.read().compositionId;
    this.stop = transport.subscribe(this.sync);
  }
  private sync = () => {
    if (this.closed) return;
    const state = this.transport.read(),
      seconds = motionTimeToSeconds(state.time);
    const mix = this.transport.readAudioMixPublication();
    if (mix && mix !== this.mixPublication) {
      this.mixPublication = mix;
      for (const change of mix.changes) {
        const previous = this.authoredMix.get(change.trackId);
        this.authoredMix.set(change.trackId, { volume: change.volume, mute: change.mute });
        this.volumeDrafts.delete(change.trackId);
        this.pendingVolumes.delete(change.trackId);
        if (
          this.mixer &&
          (!previous || previous.volume !== change.volume || previous.mute !== change.mute)
        )
          this.applyMixUpdate(
            this.mixer.setMixState(change.trackId, { volume: change.volume, mute: change.mute }),
            this.mixer,
            this.generation,
          );
      }
    }
    if (
      state.playing &&
      this.playing &&
      mix &&
      !this.mixer &&
      !this.opening &&
      mix.changes.some((change) => !change.mute && change.volume > 0)
    )
      void this.start(++this.generation);
    if (!state.playing) {
      if (this.playing) this.clear();
      this.playing = false;
      this.lastTime = seconds;
      return;
    }
    const projectId = this.engine.getSnapshot().project.id;
    if (projectId !== this.scopeProject || state.compositionId !== this.scopeComposition) {
      this.volumeDrafts.clear();
      this.pendingVolumes.clear();
      this.authoredMix.clear();
      this.mixPublication = null;
      this.scopeProject = projectId;
      this.scopeComposition = state.compositionId;
    }
    const delta = seconds - this.lastTime;
    const direction = !this.playing
      ? 1
      : state.playbackMode === "pingPong" && delta < -0.000001
        ? -1
        : state.playbackMode === "pingPong" && delta > 0.000001
          ? 1
          : this.direction;
    const discontinuity =
      this.playing &&
      (direction !== this.direction ||
        (state.playbackMode !== "pingPong" && delta < -0.05) ||
        Math.abs(delta) > 0.5);
    this.lastTime = seconds;
    if (this.playing && !discontinuity) return;
    this.clear();
    this.playing = true;
    this.direction = direction;
    // This subscriber runs synchronously inside the Play click/Space gesture.
    try {
      this.context ??= this.createContext();
    } catch (error) {
      this.fail(error);
      return;
    }
    void this.start(++this.generation);
  };
  private async start(generation: number) {
    const controller = new AbortController();
    this.controller = controller;
    let mixer: Mixer | null = null;
    try {
      await this.context!.resume();
      await this.retiring;
      if (this.closed || generation !== this.generation || controller.signal.aborted) return;
      const snapshot = this.engine.getSnapshot();
      const program = compileMotion(snapshot.project, { compositionId: snapshot.pageId });
      if (
        ![...program.layers, ...program.audio].some(
          (lane) =>
            lane.media &&
            !lane.media.mute &&
            (lane.media.volume > 0 || ("id" in lane && (this.volumeDrafts.get(lane.id) ?? 0) > 0)),
        )
      )
        return;
      this.authoredMix.clear();
      for (const lane of program.audio)
        this.authoredMix.set(lane.id, { volume: lane.media.volume, mute: lane.media.mute });
      const openingMix = new Map(this.authoredMix);
      const opening = this.createMixer(
        program,
        snapshot.project.assets,
        this.resolver(snapshot.project.id),
        {
          sampleRate: this.context!.sampleRate,
          channels: 2,
          blockFrames: 1024,
          signal: controller.signal,
        },
      );
      this.opening = opening;
      try {
        mixer = await opening;
      } finally {
        if (this.opening === opening) this.opening = null;
      }
      if (this.closed || generation !== this.generation) return;
      this.mixer = mixer;
      for (const [id, state] of this.authoredMix) {
        const original = openingMix.get(id);
        if (!original || original.volume !== state.volume || original.mute !== state.mute)
          await mixer.setMixState(id, state);
      }
      for (const [id, volume] of this.volumeDrafts) await mixer.setVolumePreview(id, volume);
      if (!mixer.hasAudio) return;
      await this.beginScheduling(generation);
    } catch (error) {
      if (mixer && this.mixer !== mixer) await mixer.dispose().catch(this.onError);
      if (generation === this.generation && !controller.signal.aborted) this.fail(error);
    }
  }
  private async beginScheduling(generation: number) {
    const mixer = this.mixer;
    if (!mixer || this.busy || this.scheduling || this.closed || generation !== this.generation)
      return;
    this.scheduling = true;
    try {
      this.firstTime = motionTimeToSeconds(this.transport.read().time);
      this.firstClock = this.context!.currentTime + 0.01;
      this.nextSample = Math.min(
        mixer.samples,
        Math.max(0, Math.floor(this.firstTime * mixer.sampleRate)),
      );
      await this.pump(generation);
      if (this.closed || generation !== this.generation || !mixer.hasAudio) return;
      this.timer = setInterval(() => {
        void this.pump(generation);
      }, 10);
    } finally {
      if (generation === this.generation) this.scheduling = false;
    }
  }
  private async pump(generation: number) {
    const mixer = this.mixer,
      context = this.context;
    if (!mixer || !context || this.busy || this.closed || generation !== this.generation) return;
    this.busy = true;
    try {
      while (generation === this.generation && this.nodes.size < 4) {
        const sample = this.nextSample;
        const at = this.firstClock + (sample / mixer.sampleRate - this.firstTime) * this.direction;
        if (at > context.currentTime + 0.04) break;
        const count = Math.min(
          mixer.blockFrames,
          this.direction > 0 ? mixer.samples - sample : sample,
        );
        if (count < 1) break;
        const start = this.direction > 0 ? sample : sample - count;
        const pcm = await mixer.readBlock(start, count);
        if (generation !== this.generation || this.closed || !mixer.hasAudio) return;
        const when =
          this.firstClock + (sample / mixer.sampleRate - this.firstTime) * this.direction;
        if (when + count / mixer.sampleRate > context.currentTime) {
          const buffer = context.createBuffer(2, count, mixer.sampleRate);
          for (let channel = 0; channel < 2; channel++) {
            const data = pcm.subarray(channel * count, (channel + 1) * count);
            if (this.direction < 0) data.reverse();
            buffer.copyToChannel(data, channel);
          }
          const source = context.createBufferSource();
          source.buffer = buffer;
          source.connect(context.destination);
          this.nodes.add(source);
          source.onended = () => {
            source.disconnect();
            this.nodes.delete(source);
          };
          const skipped = Math.max(0, context.currentTime - when);
          source.start(Math.max(context.currentTime, when), skipped);
        }
        this.nextSample += count * this.direction;
      }
    } catch (error) {
      if (generation === this.generation && !this.controller?.signal.aborted) this.fail(error);
    } finally {
      if (generation === this.generation) {
        this.busy = false;
        if (
          this.mixer === mixer &&
          mixer.hasAudio &&
          this.timer === null &&
          !this.scheduling &&
          this.transport.read().playing
        )
          void this.beginScheduling(generation);
      }
    }
  }
  private applyMixUpdate(task: Promise<void>, mixer: Mixer, generation: number) {
    void task
      .then(() => {
        if (this.mixer !== mixer || generation !== this.generation) return;
        if (!mixer.hasAudio) {
          if (this.timer !== null) clearInterval(this.timer);
          this.timer = null;
          this.silenceNative();
        } else if (this.transport.read().playing && this.timer === null)
          return this.beginScheduling(generation);
      })
      .catch((error: unknown) => {
        if (this.mixer === mixer && generation === this.generation) this.onError(error);
      });
  }
  private silenceNative() {
    for (const node of this.nodes) {
      node.onended = null;
      try {
        node.stop();
      } catch {}
      node.disconnect();
    }
    this.nodes.clear();
  }
  previewVolume(trackId: string, volume: number | null) {
    if (!this.transport.read().playing) {
      this.volumeDrafts.delete(trackId);
      this.pendingVolumes.delete(trackId);
      return;
    }
    if (volume === null) this.volumeDrafts.delete(trackId);
    else this.volumeDrafts.set(trackId, volume);
    this.pendingVolumes.set(trackId, volume);
    if (!this.context) {
      this.sync();
      return;
    }
    if (
      !this.mixer &&
      !this.opening &&
      this.transport.read().playing &&
      volume !== null &&
      volume > 0
    ) {
      void this.start(++this.generation);
      return;
    }
    if (this.volumeFrame !== null) return;
    this.volumeFrame = requestAnimationFrame(() => {
      this.volumeFrame = null;
      const updates = [...this.pendingVolumes];
      this.pendingVolumes.clear();
      for (const [id, value] of updates) {
        const mixer = this.mixer;
        if (mixer) this.applyMixUpdate(mixer.setVolumePreview(id, value), mixer, this.generation);
      }
    });
  }
  private fail(error: unknown) {
    this.clear();
    this.playing = false;
    this.transport.pause();
    this.onError(error);
  }
  private clear() {
    this.generation++;
    this.controller?.abort();
    this.controller = null;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.busy = false;
    this.scheduling = false;
    if (this.volumeFrame !== null) cancelAnimationFrame(this.volumeFrame);
    this.volumeFrame = null;
    this.pendingVolumes.clear();
    this.silenceNative();
    const mixer = this.mixer;
    this.mixer = null;
    const opening = this.opening;
    this.opening = null;
    const jobs = [
      this.retiring,
      ...(mixer ? [mixer.dispose()] : []),
      ...(opening
        ? [
            opening.then(
              (value) => value.dispose(),
              () => {},
            ),
          ]
        : []),
    ];
    this.retiring = Promise.allSettled(jobs).then((results) => {
      for (const result of results) if (result.status === "rejected") this.onError(result.reason);
    });
  }
  async dispose() {
    if (this.closed) return;
    this.closed = true;
    this.stop?.();
    this.stop = null;
    this.clear();
    const context = this.context;
    this.context = null;
    await this.retiring;
    if (context) await context.close();
  }
}
