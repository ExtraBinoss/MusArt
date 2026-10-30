import { useMemo } from "react";
import { waveformPath } from "../../../services/motion/audio/waveform-path";

/** Fixed-size source envelope, calculated once per prepared sound; no playback-frame React work. */
export function SfxWaveform({ peaks }: { peaks?: Float32Array }) {
  const path = useMemo(
    () =>
      peaks
        ? waveformPath(peaks, {
            width: 280,
            left: 0,
            visibleWidth: 280,
            sourceIn: 0,
            clipDuration: 1,
            sourceDuration: 1,
            height: 42,
          })
        : "",
    [peaks],
  );
  return (
    <svg
      className="motion-sfx-waveform"
      viewBox="0 0 280 42"
      aria-hidden
      data-preparing={!peaks || undefined}
    >
      <path d={path} className="motion-audio-envelope" />
      <path
        d={path}
        transform="translate(0 6.3) scale(1 0.7)"
        className="motion-audio-envelope-core"
      />
    </svg>
  );
}
