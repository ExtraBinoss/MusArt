import { useEffect, useId, useRef } from "react";
import type { SceneController } from "../session/scene-controller";
import type { ViewSource } from "../viewport/motion";
import type { SnapFeedback } from "../interaction/snapping/source";

const namespace = "http://www.w3.org/2000/svg";
/** Only engaged smart snaps draw measurements; subscriptions never rerender editor surfaces. */
export function Measurements({
  controller,
  zoom,
  viewSource,
  snapping,
}: {
  controller: SceneController;
  selected?: readonly string[];
  zoom: number;
  viewSource?: ViewSource;
  snapping?: SnapFeedback;
}) {
  const svg = useRef<SVGSVGElement>(null),
    id = useId().replaceAll(":", "");
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    function node(name: string, attributes: Record<string, string | number>) {
      const child = document.createElementNS(namespace, name);
      for (const [key, value] of Object.entries(attributes)) child.setAttribute(key, String(value));
      return child;
    }
    let previous: ReturnType<SnapFeedback["read"]> | undefined,
      previousZoom = 0,
      previousScope = "",
      previousPlayback: boolean | undefined;
    const paint = () => {
      const frame = controller.read(),
        currentZoom = viewSource?.read().zoom ?? zoom,
        state = snapping?.read();
      const scope = JSON.stringify([
        frame.presentation?.origin.projectId,
        frame.presentation?.origin.revision,
        frame.page.id,
        frame.page.width,
        frame.page.height,
      ]);
      if (
        state === previous &&
        currentZoom === previousZoom &&
        scope === previousScope &&
        frame.playback === previousPlayback
      )
        return;
      previous = state;
      previousZoom = currentZoom;
      previousScope = scope;
      previousPlayback = frame.playback;
      element.replaceChildren();
      element.setAttribute("viewBox", `0 0 ${frame.page.width} ${frame.page.height}`);
      const origin = state?.origin,
        presentation = frame.presentation;
      if (
        !origin ||
        !presentation ||
        !state.cues.length ||
        frame.playback ||
        origin.pageId !== frame.page.id ||
        origin.project.id !== presentation.origin.projectId ||
        origin.revision !== presentation.origin.revision
      )
        return;
      const stroke = 1 / currentZoom,
        color = "var(--guide-color, #ed66c2)";
      const defs = node("defs", {}),
        marker = node("marker", {
          id: `${id}-arrow`,
          markerWidth: 5,
          markerHeight: 5,
          refX: 2.5,
          refY: 2.5,
          orient: "auto-start-reverse",
          markerUnits: "strokeWidth",
        });
      marker.append(
        node("path", { d: "M5 0L0 2.5L5 5", fill: "none", stroke: color, "stroke-width": 1 }),
      );
      defs.append(marker);
      element.append(defs);
      for (const cue of state.cues) {
        element.append(
          node("line", {
            class: "canvas-snap-line",
            "data-snap-axis": cue.axis,
            "data-snap-target": cue.targetId,
            x1: cue.from.x,
            y1: cue.from.y,
            x2: cue.to.x,
            y2: cue.to.y,
            stroke: cue.color ?? color,
            "stroke-width": stroke,
            "stroke-dasharray": `${3 / currentZoom} ${2 / currentZoom}`,
          }),
        );
        if (!cue.gap || cue.gap.value < 1e-6) continue;
        const gap = cue.gap;
        element.append(
          node("line", {
            class: "canvas-snap-gap",
            x1: gap.from.x,
            y1: gap.from.y,
            x2: gap.to.x,
            y2: gap.to.y,
            stroke: cue.color ?? color,
            "stroke-width": stroke,
            "marker-start": `url(#${id}-arrow)`,
            "marker-end": `url(#${id}-arrow)`,
          }),
        );
        const value = String(Math.round(gap.value * 10) / 10),
          width = value.length * 7 + 12;
        const label = node("g", {
          class: "canvas-measurement-label",
          transform: `translate(${(gap.from.x + gap.to.x) / 2} ${(gap.from.y + gap.to.y) / 2 - 12 / currentZoom}) scale(${1 / currentZoom})`,
        });
        label.append(
          node("rect", {
            class: "measurement-label-background",
            x: -width / 2,
            y: -9.5,
            width,
            height: 19,
            rx: 4,
          }),
        );
        const text = node("text", {
          x: 0,
          y: 0,
          dy: "0.35em",
          "text-anchor": "middle",
          "font-size": 11,
          "font-weight": 600,
          "font-family": "Inter, sans-serif",
        });
        text.textContent = value;
        label.append(text);
        element.append(label);
      }
    };
    paint();
    const stopScene = controller.subscribe(paint),
      stopView = viewSource?.subscribe(paint),
      stopSnap = snapping?.subscribe(paint);
    return () => {
      stopScene();
      stopView?.();
      stopSnap?.();
    };
  }, [controller, zoom, viewSource, snapping, id]);
  return <svg ref={svg} className="canvas-measurements" aria-hidden />;
}
