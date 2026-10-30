import { useState } from "react";
import { motionTimeToSeconds, type EnginePort, type Composition } from "@musart/core";
import type { TimelineTransport } from "../model";
import { AudioRows } from "../audio/AudioRows";

/** The simplified visual timeline retains the native audio menus, fades and gesture handlers. */
export function SimpleAudioRows({
  engine,
  page,
  transport,
  scale,
  interactive,
  first,
  last,
  top,
}: {
  engine: EnginePort;
  page: Composition;
  transport: TimelineTransport;
  scale: number;
  interactive: boolean;
  first: number;
  last: number;
  top: number;
}) {
  const [error, setError] = useState("");
  const tracks = page.motion?.audioTracks ?? [];
  return (
    <div style={{ position: "absolute", top, width: "100%", height: tracks.length * 32 }}>
      <AudioRows
        engine={engine}
        tracks={tracks}
        assets={engine.getSnapshot().project.assets}
        transport={transport}
        first={first}
        last={last}
        offset={0}
        rowHeight={32}
        scale={scale}
        duration={motionTimeToSeconds(page.motion!.duration)}
        left={0}
        width={motionTimeToSeconds(page.motion!.duration) * scale}
        active={interactive}
        visualSelected={!!engine.getSnapshot().selection.length}
        onError={(error) => setError(String(error))}
      />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
