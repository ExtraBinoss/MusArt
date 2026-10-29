import { useId, useMemo, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import type { MotionEasing } from "@musart/core";
import { easingGraph } from "./model";
import "../../ui/glass-controls.css";
import "./messages";

export function CurveGraph({
  easing,
  onChange,
  disabled = false,
}: {
  easing: MotionEasing;
  onChange: (value: MotionEasing) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("motionEasing");
  const gridId = useId();
  const graph = useMemo(() => easingGraph(easing), [easing]);
  return (
    <svg className="motion-easing-graph" viewBox="0 0 244 140" role="group" aria-label={t("graph")}>
      <defs>
        <pattern id={gridId} width="25.5" height="23" patternUnits="userSpaceOnUse">
          <path d="M 25.5 0 L 0 0 0 23" fill="none" />
        </pattern>
      </defs>
      <rect x={20} y={24} width={204} height={92} fill={`url(#${gridId})`} />
      <line
        className="motion-easing-diagonal"
        x1={20}
        y1={graph.toY(0)}
        x2={224}
        y2={graph.toY(1)}
      />
      {easing.type === "cubicBezier" && (
        <>
          <line
            className="motion-easing-arm"
            x1={20}
            y1={graph.toY(0)}
            x2={20 + easing.x1 * 204}
            y2={graph.toY(easing.y1)}
          />
          <line
            className="motion-easing-arm"
            x1={224}
            y1={graph.toY(1)}
            x2={20 + easing.x2 * 204}
            y2={graph.toY(easing.y2)}
          />
        </>
      )}
      <path className="motion-easing-curve" d={graph.path} />
      {easing.type === "cubicBezier" &&
        ([1, 2] as const).map((point) => (
          <CurveHandle
            key={point}
            point={point}
            easing={easing}
            graph={graph}
            onChange={onChange}
            disabled={disabled}
          />
        ))}
      <text x={224} y={136} textAnchor="end">
        {t("progress")}
      </text>
      <text x={3} y={15}>
        {t("value")}
      </text>
    </svg>
  );
}

function CurveHandle({
  point,
  easing,
  graph,
  onChange,
  disabled,
}: {
  point: 1 | 2;
  easing: Extract<MotionEasing, { type: "cubicBezier" }>;
  graph: ReturnType<typeof easingGraph>;
  onChange: (value: MotionEasing) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation("motionEasing");
  const gesture = useRef<{
    pointer: number;
    point: 1 | 2;
    original: MotionEasing;
    fromY: (pixel: number) => number;
  } | null>(null);
  function start(event: PointerEvent<HTMLButtonElement>) {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { pointer: event.pointerId, point, original: easing, fromY: graph.fromY };
  }
  function cancel(node: HTMLButtonElement) {
    const active = gesture.current;
    if (!active) return;
    gesture.current = null;
    onChange(active.original);
    if (node.hasPointerCapture(active.pointer)) node.releasePointerCapture(active.pointer);
  }
  function finish(event: PointerEvent<HTMLButtonElement>) {
    if (gesture.current?.pointer !== event.pointerId) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function key(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape" && gesture.current) {
      event.preventDefault();
      event.stopPropagation();
      cancel(event.currentTarget);
      return;
    }
    if (disabled) return;
    const dx = event.key === "ArrowLeft" ? -0.01 : event.key === "ArrowRight" ? 0.01 : 0;
    const dy = event.key === "ArrowDown" ? -0.01 : event.key === "ArrowUp" ? 0.01 : 0;
    if (!dx && !dy) return;
    event.preventDefault();
    event.stopPropagation();
    const x = Math.max(0, Math.min(1, (point === 1 ? easing.x1 : easing.x2) + dx));
    const y = (point === 1 ? easing.y1 : easing.y2) + dy;
    onChange(point === 1 ? { ...easing, x1: x, y1: y } : { ...easing, x2: x, y2: y });
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId || active.original.type !== "cubicBezier")
      return;
    const bounds = event.currentTarget.closest("svg")!.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const x = Math.max(
      0,
      Math.min(1, (((event.clientX - bounds.left) / bounds.width) * 244 - 20) / 204),
    );
    const y = active.fromY(((event.clientY - bounds.top) / bounds.height) * 140);
    onChange(
      active.point === 1
        ? { ...active.original, x1: x, y1: y }
        : { ...active.original, x2: x, y2: y },
    );
  }
  return (
    <foreignObject
      className="motion-easing-handle-wrap"
      x={20 + (point === 1 ? easing.x1 : easing.x2) * 204 - 14}
      y={graph.toY(point === 1 ? easing.y1 : easing.y2) - 12}
      width={28}
      height={24}
    >
      <button
        type="button"
        className="motion-easing-handle glass-slider-thumb"
        disabled={disabled}
        role="slider"
        tabIndex={0}
        aria-label={t("handle", { number: point })}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={point === 1 ? easing.x1 : easing.x2}
        aria-valuetext={`${point === 1 ? easing.x1 : easing.x2}, ${point === 1 ? easing.y1 : easing.y2}`}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={(event) => cancel(event.currentTarget)}
        onLostPointerCapture={(event) => cancel(event.currentTarget)}
        onKeyDown={key}
      />
    </foreignObject>
  );
}
