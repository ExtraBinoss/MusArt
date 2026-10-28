import { useEffect, useId, useRef } from "react";
import { createLayerGeometryIndex, measureLayer } from "@musart/core";
import type { SceneController } from "../session/scene-controller";
import type { ViewSource } from "../viewport/motion";

const namespace = "http://www.w3.org/2000/svg";
/** Overlay changes subscribe directly to the scene, without rerendering editor surfaces. */
export function Measurements({
  controller,
  selected,
  zoom,
  viewSource,
}: {
  viewSource?: ViewSource;
  controller: SceneController;
  selected: string[];
  zoom: number;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const id = useId().replaceAll(":", "");
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    function node(name: string, attributes: Record<string, string | number>) {
      const child = document.createElementNS(namespace, name);
      for (const [key, value] of Object.entries(attributes)) child.setAttribute(key, String(value));
      return child;
    }
    let previousPage: object | null = null,
      previousZoom = 0,
      previousPlayback: boolean | undefined;
    function paint() {
      const currentZoom = viewSource?.read().zoom ?? zoom;
      const frame = controller.read(),
        page = frame.page;
      if (
        previousPage === page &&
        previousZoom === currentZoom &&
        previousPlayback === frame.playback
      )
        return;
      previousPage = page;
      previousZoom = currentZoom;
      previousPlayback = frame.playback;
      element!.replaceChildren();
      if (frame.playback) return;
      element!.setAttribute("viewBox", `0 0 ${page.width} ${page.height}`);
      const stroke = 1 / currentZoom;
      const ids = selected;
      const geometry = createLayerGeometryIndex(page);
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
        node("path", { d: "M5 0L0 2.5L5 5", fill: "none", stroke: "#ef66b6", "stroke-width": 1 }),
      );
      defs.append(marker);
      element!.append(defs);
      if (page.margins) {
        const m = page.margins;
        element!.append(
          node("rect", {
            x: m.left,
            y: m.top,
            width: Math.max(0, page.width - m.left - m.right),
            height: Math.max(0, page.height - m.top - m.bottom),
            fill: "none",
            stroke: "#ed66c2",
            "stroke-width": stroke,
            "stroke-dasharray": `${4 / currentZoom} ${4 / currentZoom}`,
          }),
        );
      }
      for (const layer of ids.length <= 64
        ? ids
            .map((id) => geometry.byId.get(id))
            .filter(
              (item) =>
                item &&
                item.visible &&
                geometry.ancestors(item.id).every((parent) => parent.visible),
            )
        : []) {
        if (!layer) continue;
        const box = node("g", { transform: `matrix(${geometry.worldMatrix(layer.id).join(" ")})` });
        for (const kind of ["margin", "padding"] as const) {
          const inset = layer[kind];
          if (!inset || !Object.values(inset).some((value) => value > 0)) continue;
          const sign = kind === "padding" ? 1 : -1;
          box.append(
            node("rect", {
              x: inset.left * sign,
              y: inset.top * sign,
              width: Math.max(0, layer.width - (inset.left + inset.right) * sign),
              height: Math.max(0, layer.height - (inset.top + inset.bottom) * sign),
              fill: kind === "padding" ? "#2563eb10" : "#ef66b610",
              stroke: kind === "padding" ? "#2563eb" : "#ef66b6",
              "stroke-width": stroke,
              "stroke-dasharray": `${3 / currentZoom} ${3 / currentZoom}`,
            }),
          );
        }
        element!.append(box);
        if (ids.length !== 1) continue;
        for (const measure of measureLayer(page, layer.id, geometry).arrows.filter(
          (arrow) => Math.abs(arrow.value) >= 1,
        )) {
          const { x: x1, y: y1 } = measure.from,
            { x: x2, y: y2 } = measure.to;
          const group = node("g", {});
          group.append(
            node("line", {
              x1,
              y1,
              x2,
              y2,
              stroke: "#ef66b6",
              "stroke-width": stroke,
              "marker-start": `url(#${id}-arrow)`,
              "marker-end": `url(#${id}-arrow)`,
            }),
          );
          const value = `${Math.round(measure.value * 10) / 10}`;
          const label = node("g", {
            class: "canvas-measurement-label",
            transform: `translate(${(x1 + x2) / 2} ${(y1 + y2) / 2 - 12 / currentZoom}) scale(${1 / currentZoom})`,
          });
          const width = value.length * 7 + 12;
          label.append(
            node("rect", {
              class: "measurement-label-background",
              x: -width / 2,
              y: -9,
              width,
              height: 18,
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
          group.append(label);
          element!.append(group);
        }
      }
    }
    paint();
    const stopScene = controller.subscribe(paint),
      stopView = viewSource?.subscribe(paint);
    return () => {
      stopScene();
      stopView?.();
    };
  }, [controller, selected, zoom, id, viewSource]);
  return <svg ref={svg} className="canvas-measurements" aria-hidden />;
}
