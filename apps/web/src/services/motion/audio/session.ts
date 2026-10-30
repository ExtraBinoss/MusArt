import type { EnginePort, MotionAudioProcessing } from "@musart/core";
import type { EditorServices } from "../../../state/contracts";
import { createMotionTransport } from "../transport";
import { AudioPreparation } from "./preparation";
import { MotionAudioPlayback } from "./playback";
import { AudioAudition } from "./audition";
import { SFX_BANK } from "./sfx";
const sessions = new WeakMap<EnginePort, MotionAudioSession>();

/** Platform lifetime owns worker/native audio. Portable authored data remains pure core TypeScript. */
export class MotionAudioSession {
  readonly preparation: AudioPreparation;
  private readonly playback: MotionAudioPlayback;
  private readonly audition: AudioAudition;
  private readonly stop: () => void;
  private closed = false;
  constructor(
    private readonly engine: EnginePort,
    private readonly services: Pick<EditorServices, "importFiles" | "mediaResolverFor">,
    onError: (error: unknown) => void,
  ) {
    const resolver = (projectId: string) => {
      const value = services.mediaResolverFor?.(projectId);
      if (!value) throw Error("Audio preview needs access to this project's original media.");
      return value;
    };
    this.preparation = new AudioPreparation((asset, signal) =>
      resolver(engine.getSnapshot().project.id).resolveOriginal(asset, { signal }),
    );
    const transport = createMotionTransport(engine);
    this.audition = new AudioAudition(engine, this.preparation, resolver, onError);
    this.playback = new MotionAudioPlayback(engine, transport, resolver, onError);
    let mixPublication = transport.readAudioMixPublication();
    let project = engine.getSnapshot().project,
      playing = transport.read().playing;
    this.stop = transport.subscribe(() => {
      const current = engine.getSnapshot().project,
        next = transport.read().playing;
      if (current.id !== project.id || (next && !playing)) this.preparation.reset();
      const mix = transport.readAudioMixPublication(),
        rebased = mix && mix.project === current && mix.pageId === engine.getSnapshot().pageId;
      if (rebased && mix !== mixPublication) {
        for (const change of mix.changes) this.audition.commitMix(change.trackId, change);
      }
      if ((current !== project && !rebased) || (next && !playing)) this.stopPreview();
      mixPublication = mix;
      project = current;
      playing = next;
    });
    sessions.set(engine, this);
  }
  importFiles(files: File[]) {
    return this.services.importFiles(files);
  }
  async importPreset(id: string) {
    const origin = this.engine.getSnapshot(),
      preset = SFX_BANK.find((item) => item.id === id);
    if (!preset) throw Error("Unknown sound preset.");
    const blob = await this.preparation.sfx(id);
    const current = this.engine.getSnapshot();
    if (
      this.closed ||
      current.project !== origin.project ||
      current.pageId !== origin.pageId ||
      current.revision !== origin.revision
    )
      throw new DOMException("The composition changed while preparing the sound.", "AbortError");
    await this.importFiles([new File([blob], `${preset.name}.wav`, { type: "audio/wav" })]);
  }
  enableSoundPreview() {
    return this.audition.enable();
  }
  previewPreset(id: string, interactive = true) {
    createMotionTransport(this.engine).pause();
    return this.audition.preset(id, interactive);
  }
  previewTrack(
    id: string,
    processing: MotionAudioProcessing,
    volume: number,
    section: "fadeIn" | "fadeOut" | "reverb" | "gain",
  ) {
    createMotionTransport(this.engine).pause();
    return this.audition.track(id, processing, volume, section);
  }
  previewVolume(trackId: string, volume: number | null) {
    if (
      volume !== null &&
      (!Number.isFinite(volume) ||
        volume < 0 ||
        volume > 1 ||
        !this.engine
          .getSnapshot()
          .project.pages.find((page) => page.id === this.engine.getSnapshot().pageId)
          ?.motion?.audioTracks?.some((track) => track.id === trackId))
    )
      return;
    this.playback.previewVolume(trackId, volume);
    this.audition.previewVolume(trackId, volume);
  }
  stopPreview(trackId?: string) {
    if (trackId !== undefined) this.audition.stopTrack(trackId);
    else this.audition.stop();
  }
  async dispose() {
    if (this.closed) return;
    this.closed = true;
    this.stop();
    this.stopPreview();
    this.preparation.dispose();
    if (sessions.get(this.engine) === this) sessions.delete(this.engine);
    const results = await Promise.allSettled([this.playback.dispose(), this.audition.dispose()]);
    const errors = results.filter((result) => result.status === "rejected");
    if (errors.length)
      throw new AggregateError(
        errors.map((result) => result.reason),
        "Audio session cleanup failed.",
      );
  }
}
export function getMotionAudioSession(engine: EnginePort) {
  return sessions.get(engine);
}
