import type { EnginePort, MotionAudioTrack } from "@musart/core";
import { classifyAudioMixChange } from "../../../services/motion/audio/commit-policy";

/** An open menu belongs to one document. Only validated scalar mix publications may rebase it. */
export function captureAudioTrackScope(
  engine: EnginePort,
  track: MotionAudioTrack,
  allowMix = true,
) {
  let origin = engine.getSnapshot();
  let active =
    origin.project.pages
      .find((page) => page.id === origin.pageId)
      ?.motion?.audioTracks?.find((item) => item.id === track.id) === track;
  return {
    read: (): MotionAudioTrack | null => {
      if (!active) return null;
      const current = engine.getSnapshot();
      if (current !== origin) {
        if (
          (current.project !== origin.project || current.pageId !== origin.pageId) &&
          (!allowMix || !classifyAudioMixChange(origin, current))
        ) {
          active = false;
          return null;
        }
        origin = current;
      }
      const value = origin.project.pages
        .find((page) => page.id === origin.pageId)
        ?.motion?.audioTracks?.find((item) => item.id === track.id);
      if (!value) active = false;
      return value ?? null;
    },
  };
}
export type AudioTrackScope = ReturnType<typeof captureAudioTrackScope>;

/** Event-only context-menu lifetime; kept outside React render state. */
export function createAudioMenuScope(engine: EnginePort) {
  let scope: AudioTrackScope | null = null,
    editing = false;
  return {
    capture(track: MotionAudioTrack) {
      scope = captureAudioTrackScope(engine, track);
      return scope.read();
    },
    read: () => scope?.read() ?? null,
    clear() {
      scope = null;
    },
    edit(value: boolean) {
      editing = value;
    },
    isEditing: () => editing,
  };
}
