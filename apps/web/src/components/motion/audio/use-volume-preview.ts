import { useCallback, useEffect, useRef, useState } from "react";
import { createSliderValue } from "../../ui/slider-value";
import type { EnginePort, MotionAudioTrack, Project } from "@musart/core";
import { getMotionAudioSession } from "../../../services/motion/audio/session";
const clamp = (value: number) => Math.max(0, Math.min(1, value));
interface Origin {
  project: Project;
  pageId: string;
  track: MotionAudioTrack;
}

/** Native/worker drafts are imperative; only completed gestures publish a document command. */
export function useVolumePreview(
  engine: EnginePort,
  track: MotionAudioTrack,
  readTrack?: () => MotionAudioTrack | null,
) {
  const service = getMotionAudioSession(engine);
  const [reset, setReset] = useState({ track, value: clamp(track.volume), epoch: 0 });
  const [changed, setChanged] = useState(false);
  const [slider] = useState(() => createSliderValue([Math.round(clamp(track.volume) * 100)]));
  const output = useRef<HTMLOutputElement>(null),
    input = useRef<HTMLInputElement>(null);
  const held = useRef<Origin | null>(null),
    latest = useRef(clamp(track.volume));
  if (reset.track !== track)
    setReset({ track, value: clamp(track.volume), epoch: reset.epoch + 1 });
  const display = useCallback(
    (value: number, syncInput = true) => {
      latest.current = value;
      slider.set([Math.round(value * 100)]);
      if (output.current) output.current.textContent = `${Math.round(value * 100)}%`;
      if (syncInput && input.current) input.current.value = String(Math.round(value * 100));
    },
    [slider],
  );
  const cancel = useCallback(
    (update = true) => {
      held.current = null;
      service?.previewVolume(track.id, null);
      const snapshot = engine.getSnapshot(),
        current = snapshot.project.pages
          .find((page) => page.id === snapshot.pageId)
          ?.motion?.audioTracks?.find((item) => item.id === track.id);
      const value = clamp(current?.volume ?? track.volume);
      display(value);
      if (update) setReset((state) => ({ track: current ?? track, value, epoch: state.epoch + 1 }));
    },
    [engine, service, track, display],
  );
  function preview(value: number, syncInput = true) {
    if (!Number.isFinite(value) || value < 0 || value > 1) return;
    const current = engine.getSnapshot();
    if (readTrack && !readTrack()) {
      setChanged(true);
      cancel();
      return;
    }
    if (!held.current) {
      if (
        current.project.pages
          .find((page) => page.id === current.pageId)
          ?.motion?.audioTracks?.find((item) => item.id === track.id) !== track
      ) {
        setChanged(true);
        cancel();
        return;
      }
      held.current = { project: current.project, pageId: current.pageId, track };
    }
    display(value, syncInput);
    service?.previewVolume(track.id, value);
  }
  function commit(value = latest.current) {
    const origin = held.current;
    held.current = null;
    service?.previewVolume(track.id, null);
    if (!origin) return;
    const current = engine.getSnapshot();
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      value > 1 ||
      current.project !== origin.project ||
      current.pageId !== origin.pageId
    ) {
      setChanged(true);
      cancel();
      return;
    }
    display(value);
    if (value !== origin.track.volume)
      engine.execute({
        type: "updateMotionAudioTrack",
        trackId: track.id,
        patch: { volume: value },
      });
  }
  useEffect(() => {
    slider.set([Math.round(reset.value * 100)]);
  }, [reset, slider]);
  useEffect(() => {
    const stop = engine.subscribe(() => {
      const origin = held.current,
        current = engine.getSnapshot();
      if (origin && (current.project !== origin.project || current.pageId !== origin.pageId)) {
        setChanged(true);
        cancel();
      }
    });
    return () => {
      stop();
      held.current = null;
      service?.previewVolume(track.id, null);
    };
  }, [engine, service, track, cancel]);
  return { reset, output, input, slider, changed, preview, commit, cancel };
}
