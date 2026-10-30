import { useSyncExternalStore } from "react";
import type { EnginePort } from "@musart/core";
import { createMotionTransport } from "../../../services/motion/transport";
import { TransitionPopover } from "./TransitionPopover";
import { TransitionOccurrenceChooser } from "./TransitionOccurrenceChooser";
import { getTransitionRequests } from "./requests";

/** Mounted once outside transient menus, so a menu closing cannot destroy its transition editor. */
export function TransitionRequestHost({ engine }: { engine: EnginePort }) {
  const port = getTransitionRequests(engine);
  const request = useSyncExternalStore(port.subscribe, port.read, port.read);
  if (!request) return null;
  if (request.choices?.length)
    return (
      <TransitionOccurrenceChooser
        request={request}
        onChoose={(trackId) => {
          port.select(request.token, trackId);
        }}
        onClose={() => port.clear(request.token)}
      />
    );
  return (
    <TransitionPopover
      key={request.id}
      engine={engine}
      compositionId={request.origin.compositionId}
      layerId={request.origin.layerId}
      trackId={request.origin.trackId}
      transport={createMotionTransport(engine)}
      initialOrigin={request.origin}
      onClose={() => port.clear(request.token)}
      anchor={
        <span
          aria-hidden
          style={{
            position: "fixed",
            left: request.point.x,
            top: request.point.y,
            width: 1,
            height: 1,
            pointerEvents: "none",
            opacity: 0,
          }}
        />
      }
    />
  );
}
