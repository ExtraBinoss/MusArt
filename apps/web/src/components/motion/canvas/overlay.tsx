import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createAudioTrackGestures } from "../audio/gestures";
import { classifyAudioMixChange } from "../../../services/motion/audio/commit-policy";
import { layerDragPresentation } from "../../layers/drag/presentation";
import { createTimelineHoverSource } from "../../../state/motion/hover";
import type { CanvasTimelineOverlayProps } from "./overlay-model";
import type { TimelineCanvasHit } from "./model";
import { CanvasTimelineTarget } from "./overlay-target";
import {
  promoteTimelinePointer,
  timelineHitIdentity,
  timelineLayerDragEvent,
} from "./overlay-events";
import { timelineKeyboardTarget } from "./keyboard";
import { installTimelineCanvasDropTarget } from "./drop-target";
import "./overlay.css";

const keyboardDirections: Readonly<Record<string, "left" | "right" | "up" | "down" | undefined>> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};
function controlSelector(hit: TimelineCanvasHit) {
  if (hit.kind === "trimStart" || hit.kind === "audioTrimStart")
    return ".motion-trim-handle.is-start";
  if (hit.kind === "trimEnd" || hit.kind === "audioTrimEnd") return ".motion-trim-handle.is-end";
  if (hit.kind === "key") return ".motion-key";
  if (hit.kind === "easing") return ".motion-easing-segment";
  if (hit.kind === "gap") return ".motion-gap-add:not([hidden])";
  return ".motion-track";
}

/** One pointed/focused DOM target replaces the former per-key and per-clip React controllers. */
export function CanvasTimelineOverlay(props: CanvasTimelineOverlayProps) {
  const { host, engine, compositionId, interactive } = props;
  const [hit, setHit] = useState<TimelineCanvasHit | null>(null);
  const target = useRef<HTMLDivElement>(null);
  const admitted = useRef<TimelineCanvasHit | null>(null);
  const audioGestures = useMemo(
    () => createAudioTrackGestures(engine, props.transport, props.onAudioError),
    [engine, props.transport, props.onAudioError],
  );
  const hover = useMemo(() => createTimelineHoverSource(engine), [engine]);
  useEffect(() => {
    if (!interactive) return;
    return installTimelineCanvasDropTarget({
      host,
      compositionId,
      onPoseChange: () => layerDragPresentation(engine).invalidate(),
    });
  }, [host, compositionId, interactive, engine]);
  useLayoutEffect(() => {
    const viewport = host.viewport.current;
    if (!viewport) return;
    const sync = () => {
      const node = target.current;
      if (!node) return;
      const model = props.model ?? host.readModel();
      node.style.width = `${Math.max(viewport.clientWidth - model.gutter, Math.min(1_000_000, model.duration * model.scale + 64))}px`;
      node.style.transform = `translate(${-viewport.scrollLeft}px, ${-viewport.scrollTop}px)`;
    };
    sync();
    viewport.addEventListener("scroll", sync, { passive: true });
    const resize = new ResizeObserver(sync);
    resize.observe(viewport);
    return () => {
      viewport.removeEventListener("scroll", sync);
      resize.disconnect();
    };
  }, [host, props.model, props.unit, props.drag]);
  useLayoutEffect(
    () => audioGestures.subscribePreview(() => host.setAudioDraft(audioGestures.readPreview())),
    [audioGestures, host],
  );
  useEffect(() => () => audioGestures.cancel(), [audioGestures]);
  useEffect(() => {
    if (!interactive) {
      audioGestures.cancel();
    }
  }, [audioGestures, interactive]);
  useEffect(() => {
    const root = host.root.current,
      viewport = host.viewport.current;
    if (!root || !viewport || !interactive) return;
    let pointed: TimelineCanvasHit | null = host.readModel().hoverHit ?? null,
      shown = timelineHitIdentity(admitted.current),
      held = false;
    let rendered: TimelineCanvasHit | null = admitted.current;
    let clearHover: (() => void) | null = null,
      layer = "";
    let promoted: { node: HTMLElement; x: number; y: number; moved: boolean } | null = null;
    let admission: number | null = null,
      requested = "";
    let lastPointer: PointerEvent | null = null,
      forwardingContext = false;
    const cancelAdmission = () => {
      if (admission !== null) window.clearTimeout(admission);
      admission = null;
      requested = "";
    };
    const popup = () =>
      !!document.querySelector(
        '[data-slot="popover-content"][data-state="open"],[data-slot="context-menu-content"][data-state="open"]',
      );
    const paintHover = (next: TimelineCanvasHit | null) => {
      if (next && "layerId" in next && layer !== next.layerId) {
        const releasePrevious = clearHover;
        layer = next.layerId;
        clearHover = hover.show(compositionId, layer);
        releasePrevious?.();
      } else if (!next || !("layerId" in next)) {
        clearHover?.();
        clearHover = null;
        layer = "";
      }
      if (
        timelineHitIdentity(pointed) !== timelineHitIdentity(next) ||
        pointed?.kind !== next?.kind
      )
        host.setHoverHit(next);
      pointed = next;
    };
    const commit = (next: TimelineCanvasHit | null, intent: boolean) => {
      if (!intent && next && target.current?.contains(document.activeElement)) return;
      const identity = timelineHitIdentity(next);
      if (shown === identity) return;
      flushSync(() => {
        shown = identity;
        admitted.current = rendered = next;
        setHit(next);
      });
    };
    const read = (event: { clientX: number; clientY: number; target: EventTarget | null }) => {
      if (event.target instanceof Element && event.target.closest(".motion-row-label")) return null;
      return host.readHit(event.clientX, event.clientY);
    };
    const publish = (next: TimelineCanvasHit | null, intent = false) => {
      paintHover(next);
      if (intent || !next || !["clip", "key", "easing"].includes(next.kind)) {
        cancelAdmission();
        commit(next, intent);
        return;
      }
      if (target.current?.contains(document.activeElement) || shown === timelineHitIdentity(next)) {
        cancelAdmission();
        return;
      }
      const identity = timelineHitIdentity(next);
      if (admission !== null && requested === identity) return;
      cancelAdmission();
      requested = identity;
      admission = window.setTimeout(() => {
        admission = null;
        requested = "";
        const pointer = lastPointer;
        if (!pointer || held || popup()) return;
        const current = read(pointer);
        paintHover(current);
        if (timelineHitIdentity(current) !== identity) {
          publish(current);
          return;
        }
        commit(current, false);
        if (!current || shown !== identity) return;
        // Newly admitted Radix triggers receive only a move, preserving their own hover delay.
        target.current?.querySelector<HTMLElement>(controlSelector(current))?.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            cancelable: true,
            pointerId: pointer.pointerId,
            pointerType: pointer.pointerType,
            clientX: pointer.clientX,
            clientY: pointer.clientY,
            buttons: 0,
            shiftKey: pointer.shiftKey,
            altKey: pointer.altKey,
            ctrlKey: pointer.ctrlKey,
            metaKey: pointer.metaKey,
          }),
        );
      }, 64);
    };
    const move = (event: PointerEvent) => {
      if (promoted && Math.hypot(event.clientX - promoted.x, event.clientY - promoted.y) >= 3)
        promoted.moved = true;
      if (held || event.buttons || popup()) {
        cancelAdmission();
        return;
      }
      lastPointer = event;
      publish(read(event));
    };
    const down = (event: PointerEvent) => {
      cancelAdmission();
      if (event.button !== 0) return;
      if (popup() || (event.target instanceof Element && event.target.closest(".motion-row-label")))
        return;
      if (
        event.target instanceof Element &&
        event.target.closest(".motion-canvas-active-overlay .motion-audio-fade-trigger")
      ) {
        // Command overlays own their click; they are not temporal clip/trim artwork.
        held = event.button === 0;
        promoted = null;
        return;
      }
      const next = read(event);
      if (!next) return;
      const selector = controlSelector(next);
      if (
        event.target instanceof Element &&
        event.target.closest(".motion-canvas-active-overlay") &&
        event.target.closest(selector) &&
        timelineHitIdentity(next) === shown
      ) {
        held = event.button === 0;
        return;
      }
      publish(next, true);
      const control = target.current?.querySelector<HTMLElement>(selector);
      if (!control || event.button !== 0) return;
      held = true;
      promoted = { node: control, x: event.clientX, y: event.clientY, moved: false };
      event.preventDefault();
      event.stopPropagation();
      promoteTimelinePointer(event, control);
    };
    const up = () => {
      held = false;
    };
    const context = (event: MouseEvent) => {
      if (forwardingContext) return;
      cancelAdmission();
      if (event.target instanceof Element && event.target.closest(".motion-row-label")) return;
      const next = read(event);
      if (!next) return;
      if (
        event.target instanceof Element &&
        timelineHitIdentity(next) === shown &&
        event.target
          .closest('[data-slot="context-menu-trigger"]')
          ?.closest(".motion-canvas-active-overlay")
      )
        return;
      publish(next, true);
      const control = target.current?.querySelector<HTMLElement>(".motion-key,.motion-track");
      if (!control) return;
      event.preventDefault();
      event.stopPropagation();
      forwardingContext = true;
      try {
        control.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            button: 2,
            clientX: event.clientX,
            clientY: event.clientY,
            shiftKey: event.shiftKey,
          }),
        );
      } finally {
        forwardingContext = false;
      }
    };
    const click = (event: MouseEvent) => {
      const previous = promoted;
      promoted = null;
      if (
        !previous ||
        previous.moved ||
        !previous.node.isConnected ||
        previous.node.contains(event.target as Node)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      previous.node.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          detail: event.detail,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
        }),
      );
    };
    const leave = () => {
      cancelAdmission();
      lastPointer = null;
      if (held || popup() || target.current?.contains(document.activeElement)) return;
      publish(null);
    };
    const scroll = () => {
      cancelAdmission();
      lastPointer = null;
      if (!held && !popup() && !target.current?.contains(document.activeElement)) publish(null);
    };
    const keyboard = (event: KeyboardEvent) => {
      cancelAdmission();
      const direction = keyboardDirections[event.key];
      if (!direction || event.altKey || event.ctrlKey || event.metaKey || popup()) return;
      if (
        event.target instanceof Element &&
        event.target.closest("input,textarea,[contenteditable],[role=slider]")
      )
        return;
      const next = timelineKeyboardTarget(host, rendered, direction);
      if (!next) return;
      event.preventDefault();
      event.stopPropagation();
      publish(next, true);
      target.current?.querySelector<HTMLElement>(".motion-key")?.focus({ preventScroll: true });
    };
    const nativeDrag = (event: globalThis.DragEvent) => {
      if (!props.drag || !event.dataTransfer) return;
      const bounds = viewport.getBoundingClientRect(),
        model = host.readModel();
      const index = Math.floor(
        (event.clientY - bounds.top - 32 + viewport.scrollTop) / model.rowHeight,
      );
      const proxy = root.querySelector<HTMLElement>("[data-timeline-drop-target]:not([hidden])");
      const row =
        model.rows[
          proxy?.dataset.timelineRowIndex !== undefined
            ? Number(proxy.dataset.timelineRowIndex)
            : index
        ];
      if (!row || event.clientX < bounds.left + model.gutter) return;
      const label =
        proxy?.dataset.layerDropId === row.layer.id
          ? proxy
          : viewport.querySelector<HTMLElement>(
              `[data-layer-drop-kind][data-motion-row-key="${CSS.escape(row.key)}"]`,
            );
      if (!label) return;
      const input = timelineLayerDragEvent(event, label);
      if (
        layerDragPresentation(engine).retainIntent(
          { x: event.clientX, y: event.clientY, alt: event.altKey },
          compositionId,
          label,
        )
      ) {
        if (event.type === "drop") props.drag.native.drop(input);
        else props.drag.native.overTree(input);
        return;
      }
      if (row.kind !== "layer") props.drag.rejectProperty(input, row.layer.id);
      else if (event.type === "drop") props.drag.native.drop(input, row.layer);
      else props.drag.native.over(input, row.layer);
    };
    let original = engine.getSnapshot();
    const stopEngine = engine.subscribe(() => {
      const current = engine.getSnapshot();
      const changed = current.project !== original.project || current.pageId !== original.pageId;
      const retainMix =
        changed &&
        rendered?.kind.startsWith("audio") &&
        !!classifyAudioMixChange(original, current);
      original = current;
      if (changed) {
        cancelAdmission();
        lastPointer = null;
      }
      if (changed && !retainMix) {
        held = false;
        promoted = null;
        publish(null, true);
      }
    });
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerdown", down, true);
    root.addEventListener("click", click, true);
    root.addEventListener("contextmenu", context, true);
    root.addEventListener("pointerleave", leave);
    root.addEventListener("dragover", nativeDrag);
    root.addEventListener("drop", nativeDrag);
    root.addEventListener("keydown", keyboard);
    viewport.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      cancelAdmission();
      lastPointer = null;
      stopEngine();
      clearHover?.();
      host.setHoverHit(null);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerdown", down, true);
      root.removeEventListener("click", click, true);
      root.removeEventListener("contextmenu", context, true);
      root.removeEventListener("pointerleave", leave);
      root.removeEventListener("dragover", nativeDrag);
      root.removeEventListener("drop", nativeDrag);
      root.removeEventListener("keydown", keyboard);
      viewport.removeEventListener("scroll", scroll);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [host, engine, compositionId, interactive, hover, props.drag]);
  return (
    <div ref={target} className="motion-canvas-overlays">
      {interactive && hit && (
        <CanvasTimelineTarget {...props} hit={hit} audioGestures={audioGestures} />
      )}
    </div>
  );
}
