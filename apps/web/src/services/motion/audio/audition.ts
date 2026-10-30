import {
  addMotionTime,
  isAudioAsset,
  subtractMotionTime,
  validateMotionAudioProcessing,
  type EnginePort,
  type MotionAudioProcessing,
} from "@musart/core";
import type { MediaSourceResolver, MotionAudioPlan } from "@musart/render";
import type { AudioPreparation } from "./preparation";
import { createWorkerAudioMixer } from "./mixer-worker-client";
import { createPresetAudition } from "./preset";
import { abortableAudio } from "./abort";

/** Solo auditions use the real shared DSP, with <=4 seconds of native PCM storage. */
export class AudioAudition {
  private context: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private trackId: string | null = null;
  private authoredVolume = 1;
  private draftVolume: number | null = null;
  private muted = false;
  private controller: AbortController | null = null;
  private job: Promise<void> | null = null;
  private retiring = Promise.resolve();
  private generation = 0;
  private closed = false;
  constructor(
    private readonly engine: EnginePort,
    private readonly preparation: AudioPreparation,
    private readonly resolver: (projectId: string) => MediaSourceResolver,
    private readonly onError: (error: unknown) => void,
    private readonly createContext = () =>
      new AudioContext({ sampleRate: 48000, latencyHint: "interactive" }),
    private readonly createMixer = createWorkerAudioMixer,
  ) {}

  private audioContext() {
    this.context ??= this.createContext();
    return this.context;
  }
  enable() {
    try {
      return this.audioContext().resume();
    } catch (error) {
      return Promise.reject(error);
    }
  }
  private play(
    buffer: AudioBuffer,
    context: AudioContext,
    generation: number,
    volume = 1,
    trackId: string | null = null,
    authoredVolume = volume,
  ) {
    if (this.closed || this.generation !== generation) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    gain.gain.value =
      this.trackId === trackId && trackId !== null
        ? this.muted
          ? 0
          : (this.draftVolume ?? this.authoredVolume)
        : volume;
    source.connect(gain);
    gain.connect(context.destination);
    this.source = source;
    this.gain = gain;
    if (this.trackId !== trackId || trackId === null) {
      this.authoredVolume = authoredVolume;
      this.draftVolume = null;
      this.muted = false;
    }
    this.trackId = trackId;
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      if (this.source === source) {
        this.source = null;
        this.gain = null;
        this.trackId = null;
      }
    };
    source.start();
  }
  preset(id: string, interactive = true): Promise<void> {
    this.stop();
    const generation = ++this.generation,
      retiring = this.retiring,
      origin = this.engine.getSnapshot();
    const controller = new AbortController();
    this.controller = controller;
    let context: AudioContext, resumed: Promise<void>;
    try {
      context = this.audioContext();
      if (!interactive && context.state !== "running")
        throw new DOMException(
          "Press Play to enable sound previews in this browser.",
          "NotAllowedError",
        );
      resumed = context.resume();
    } catch (error) {
      return Promise.reject(error);
    }
    this.preparation.pauseWaveforms();
    this.job = (async () => {
      await abortableAudio(resumed, controller.signal);
      await retiring;
      controller.signal.throwIfAborted();
      const blob = await this.preparation.sfx(id);
      controller.signal.throwIfAborted();
      const { asset, plan } = createPresetAudition(id, blob);
      const mixer = await this.createMixer(
        plan,
        { [asset.id]: asset },
        { resolveOriginal: async () => blob },
        { sampleRate: 48000, channels: 2, blockFrames: 4096, signal: controller.signal },
      );
      try {
        const count = Math.min(mixer.samples, 48000 * 3),
          buffer = context.createBuffer(2, count, 48000);
        for (let frame = 0; frame < count; frame += mixer.blockFrames) {
          const frames = Math.min(count - frame, mixer.blockFrames),
            pcm = await mixer.readBlock(frame, frames);
          controller.signal.throwIfAborted();
          for (let channel = 0; channel < 2; channel++)
            buffer.copyToChannel(
              pcm.subarray(channel * frames, (channel + 1) * frames),
              channel,
              frame,
            );
        }
        const current = this.engine.getSnapshot();
        if (
          !this.closed &&
          generation === this.generation &&
          current.project === origin.project &&
          current.pageId === origin.pageId
        )
          this.play(buffer, context, generation);
      } finally {
        await mixer.dispose();
      }
    })().finally(() => {
      if (generation === this.generation) this.preparation.resumeWaveforms();
    });
    void this.job.catch((error: unknown) => {
      if (
        !this.closed &&
        generation === this.generation &&
        !(error instanceof DOMException && ["AbortError", "NotAllowedError"].includes(error.name))
      )
        this.onError(error);
    });
    return this.job;
  }
  track(
    trackId: string,
    processing: MotionAudioProcessing,
    volume: number,
    section: "fadeIn" | "fadeOut" | "reverb" | "gain",
  ) {
    this.stop();
    const generation = ++this.generation,
      retiring = this.retiring,
      snapshot = this.engine.getSnapshot();
    const track = snapshot.project.pages
      .find((page) => page.id === snapshot.pageId)
      ?.motion?.audioTracks?.find((item) => item.id === trackId);
    const asset = track ? snapshot.project.assets[track.assetId] : undefined;
    if (!track || !asset || !isAudioAsset(asset))
      return Promise.reject(Error("The audio clip is no longer available."));
    const duration = subtractMotionTime(track.end, track.start);
    validateMotionAudioProcessing(processing, duration);
    if (!Number.isFinite(volume) || volume < 0 || volume > 2)
      return Promise.reject(Error("Audio gain must be between 0 and 200%."));
    const zero = { value: 0, rate: 1 };
    const plan: MotionAudioPlan = {
      mode: "motion",
      duration,
      layers: [],
      audio: [
        {
          id: track.id,
          start: zero,
          end: duration,
          media: {
            assetId: asset.id,
            sourceStart: addMotionTime(asset.firstTimestamp, track.sourceIn),
            timelineStart: zero,
            mute: false,
            volume: 1,
            processing,
          },
        },
      ],
    };
    this.trackId = track.id;
    this.authoredVolume = track.volume;
    this.draftVolume = volume !== track.volume ? volume : null;
    this.muted = false;
    this.preparation.pauseWaveforms();
    const controller = new AbortController();
    this.controller = controller;
    let context: AudioContext, resumed: Promise<void>;
    try {
      context = this.audioContext();
      resumed = context.resume();
    } catch (error) {
      this.preparation.resumeWaveforms();
      return Promise.reject(error);
    }
    this.job = (async () => {
      await resumed;
      await retiring;
      if (this.closed || generation !== this.generation || controller.signal.aborted) return;
      const mixer = await this.createMixer(
        plan,
        { [asset.id]: asset },
        this.resolver(snapshot.project.id),
        {
          sampleRate: 48000,
          channels: 2,
          blockFrames: 4096,
          clampOutput: false,
          signal: controller.signal,
        },
      );
      try {
        const count = Math.min(mixer.samples, 48000 * 4),
          first = section === "fadeOut" ? Math.max(0, mixer.samples - count) : 0;
        if (!count) throw Error("This audio clip is shorter than one output sample.");
        const buffer = context.createBuffer(2, count, 48000);
        for (let frame = 0; frame < count; frame += mixer.blockFrames) {
          const frames = Math.min(count - frame, mixer.blockFrames),
            pcm = await mixer.readBlock(first + frame, frames);
          if (this.closed || generation !== this.generation || controller.signal.aborted) return;
          for (let channel = 0; channel < 2; channel++)
            buffer.copyToChannel(
              pcm.subarray(channel * frames, (channel + 1) * frames),
              channel,
              frame,
            );
        }
        const current = this.engine.getSnapshot();
        const currentTrack = current.project.pages
          .find((page) => page.id === current.pageId)
          ?.motion?.audioTracks?.find((item) => item.id === track.id);
        const sameSource =
          currentTrack &&
          currentTrack.assetId === track.assetId &&
          currentTrack.start === track.start &&
          currentTrack.end === track.end &&
          currentTrack.sourceIn === track.sourceIn &&
          currentTrack.processing === track.processing;
        if (
          current.project.id === snapshot.project.id &&
          current.pageId === snapshot.pageId &&
          (current.project === snapshot.project || sameSource)
        )
          this.play(buffer, context, generation, volume, track.id, track.volume);
      } finally {
        await mixer.dispose();
      }
    })().finally(() => {
      if (generation === this.generation) this.preparation.resumeWaveforms();
    });
    return this.job;
  }
  private applyNativeVolume() {
    if (this.gain && this.context)
      this.gain.gain.setTargetAtTime(
        this.muted ? 0 : (this.draftVolume ?? this.authoredVolume),
        this.context.currentTime,
        0.01,
      );
  }
  previewVolume(trackId: string, volume: number | null) {
    if (this.trackId !== trackId) return;
    this.draftVolume = volume;
    this.applyNativeVolume();
  }
  commitMix(trackId: string, state: { volume: number; mute: boolean }) {
    if (this.trackId !== trackId) return;
    this.authoredVolume = state.volume;
    this.muted = state.mute;
    this.draftVolume = null;
    this.applyNativeVolume();
  }
  /** A virtualized row may retire while a different cue (or the sound bank) owns audition. */
  stopTrack(trackId: string) {
    if (this.trackId === trackId) this.stop();
  }
  stop(resumeWaveforms = true) {
    if (resumeWaveforms) this.preparation.resumeWaveforms();
    this.generation++;
    this.controller?.abort();
    this.controller = null;
    const source = this.source;
    this.source = null;
    const gain = this.gain;
    this.gain = null;
    this.trackId = null;
    if (source) {
      source.onended = null;
      try {
        source.stop();
      } catch {}
      source.disconnect();
    }
    gain?.disconnect();
    const job = this.job;
    this.job = null;
    if (job) this.retiring = Promise.allSettled([this.retiring, job]).then(() => {});
  }
  async dispose() {
    if (this.closed) return;
    this.closed = true;
    this.stop();
    await this.retiring;
    const context = this.context;
    this.context = null;
    if (context) await context.close();
  }
}
