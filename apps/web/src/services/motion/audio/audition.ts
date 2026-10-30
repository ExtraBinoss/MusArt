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
import { BankAudioCache } from "./bank/cache";
import type { BankOwner, BankPlayback, BankClock, BankShapeData, BankJob } from "./bank/model";
interface BankClaim {
  owner: BankOwner;
  playback: BankPlayback;
  preset: string;
  generation: number;
  clock: { start: number; duration: number; ended: boolean } | null;
}

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
  private bankClaim: BankClaim | null = null;
  constructor(
    private readonly engine: EnginePort,
    private readonly preparation: AudioPreparation,
    private readonly resolver: (projectId: string) => MediaSourceResolver,
    private readonly onError: (error: unknown) => void,
    private readonly createContext = () =>
      new AudioContext({ sampleRate: 48000, latencyHint: "interactive" }),
    private readonly createMixer = createWorkerAudioMixer,
    private readonly bank = new BankAudioCache(),
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
    bankClaim?: BankClaim,
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
      if (bankClaim && this.bankClaim === bankClaim && bankClaim.clock)
        bankClaim.clock.ended = true;
      source.disconnect();
      gain.disconnect();
      if (this.source === source) {
        this.source = null;
        this.gain = null;
        this.trackId = null;
      }
    };
    if (bankClaim?.clock) {
      bankClaim.clock.start = context.currentTime;
      source.start(bankClaim.clock.start);
    } else source.start();
  }
  openBank(owner: BankOwner, data: BankShapeData) {
    const cold = !this.bank.ready(data);
    if (cold) this.preparation.pauseWaveforms();
    void this.bank.open(owner, data).then(() => {
      if (cold && this.bank.owns(owner)) this.preparation.resumeWaveforms();
    });
  }
  closeBank(owner: BankOwner) {
    this.stopBank(owner);
    const closed = this.bank.close(owner);
    if (closed) this.preparation.resumeWaveforms();
  }
  closeBankWarmup() {
    this.bank.closeCurrent();
  }
  bankOriginal(id: string) {
    return this.bank.original(id);
  }
  bankAtlas(owner: BankOwner, input: Omit<Extract<BankJob, { type: "atlas" }>, "id" | "type">) {
    if (!this.bank.owns(owner))
      return Promise.reject(new DOMException("Sound-bank owner retired.", "AbortError"));
    return this.bank.client.atlas(owner, input);
  }
  stopBank(owner: BankOwner, playback?: BankPlayback) {
    const claim = this.bankClaim;
    if (claim?.owner === owner && (!playback || claim.playback === playback)) this.stop(false);
  }
  readBankClock(owner: BankOwner, playback: BankPlayback): BankClock | null {
    const claim = this.bankClaim,
      context = this.context;
    if (!claim || claim.owner !== owner || claim.playback !== playback || !claim.clock || !context)
      return null;
    const elapsed = claim.clock.ended
      ? claim.clock.duration
      : Math.max(0, Math.min(claim.clock.duration, context.currentTime - claim.clock.start));
    return {
      preset: claim.preset,
      elapsed,
      duration: claim.clock.duration,
      playing: !claim.clock.ended && elapsed < claim.clock.duration && context.state === "running",
    };
  }
  previewBank(
    owner: BankOwner,
    playback: BankPlayback,
    preset: string,
    interactive: boolean,
  ): Promise<void> {
    if (this.closed || !this.bank.owns(owner))
      return Promise.reject(new DOMException("Sound-bank owner retired.", "AbortError"));
    this.stop(false);
    const generation = ++this.generation,
      origin = this.engine.getSnapshot(),
      controller = new AbortController();
    this.controller = controller;
    const claim: BankClaim = { owner, playback, preset, generation, clock: null };
    this.bankClaim = claim;
    let context: AudioContext, resumed: Promise<void>;
    try {
      context = this.audioContext();
      if (!interactive && context.state !== "running")
        throw new DOMException(
          "Press Play to enable sound previews in this browser.",
          "NotAllowedError",
        );
      resumed = context.state === "running" ? Promise.resolve() : context.resume();
    } catch (error) {
      return Promise.reject(error);
    }
    const prepared = this.bank.buffer(owner, preset, context);
    this.job = (async () => {
      const [, entry] = await Promise.all([abortableAudio(resumed, controller.signal), prepared]);
      controller.signal.throwIfAborted();
      const current = this.engine.getSnapshot();
      if (
        !this.closed &&
        generation === this.generation &&
        current.project === origin.project &&
        current.pageId === origin.pageId
      ) {
        claim.clock = { start: context.currentTime, duration: entry.duration, ended: false };
        this.play(entry.buffer, context, generation, 1, null, 1, claim);
      }
    })();
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
    this.bankClaim = null;
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
    this.bank.dispose();
    await this.retiring;
    const context = this.context;
    this.context = null;
    if (context) await context.close();
  }
}
