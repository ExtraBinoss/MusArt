import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type HTMLAttributes,
} from "react";
import { Slot } from "radix-ui";
import { useTranslation } from "react-i18next";
import { subtractMotionTime, type MotionTime } from "@musart/core";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import type { TimelineUnit } from "./model";
import { formatTimelineTime } from "./time";

/** One local render at gesture entry/exit; the live duration itself is painted imperatively. */
export const TrackDurationTooltip = forwardRef<
  HTMLElement,
  Omit<HTMLAttributes<HTMLElement>, "children"> & {
    trackId: string;
    start: MotionTime;
    end: MotionTime;
    unit: TimelineUnit;
    children: ReactElement;
  }
>(function TrackDurationTooltip({ trackId, start, end, unit, children, ...props }, ref) {
  const { t } = useTranslation("motion");
  const [open, setOpen] = useState(false);
  const shown = useRef(false);
  const held = useRef<{
    pointer: number;
    x: number;
    y: number;
    trim: boolean;
    axis: "pending" | "time" | "reorder";
    active: boolean;
    control: HTMLElement;
  } | null>(null);
  useEffect(
    () => () => {
      held.current = null;
      shown.current = false;
    },
    [],
  );
  function changeOpen(value: boolean) {
    if (shown.current === value) return;
    shown.current = value;
    setOpen(value);
  }
  function release(pointer?: number) {
    if (pointer !== undefined && held.current && held.current.pointer !== pointer) return;
    held.current = null;
    changeOpen(false);
  }
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip
        open={open}
        onOpenChange={(value) => {
          if (!held.current?.active && !(held.current && value)) changeOpen(value);
        }}
      >
        <TooltipTrigger asChild>
          <Slot.Root
            {...props}
            ref={ref}
            data-motion-clip-id={trackId}
            onPointerDownCapture={(event) => {
              props.onPointerDownCapture?.(event);
              if (event.button === 0) {
                const control = (event.target as Element).closest<HTMLElement>(
                  ".motion-trim-handle,.motion-track",
                );
                if (!control || control.matches(":disabled,[aria-disabled=true]")) return;
                held.current = {
                  pointer: event.pointerId,
                  x: event.clientX,
                  y: event.clientY,
                  trim: control.classList.contains("motion-trim-handle"),
                  axis: "pending",
                  active: false,
                  control,
                };
              }
            }}
            onPointerMoveCapture={(event) => {
              props.onPointerMoveCapture?.(event);
              const current = held.current;
              if (
                !current ||
                current.pointer !== event.pointerId ||
                current.active ||
                !current.control.hasPointerCapture(current.pointer)
              )
                return;
              const dx = Math.abs(event.clientX - current.x),
                dy = Math.abs(event.clientY - current.y);
              if (current.trim) {
                if (dx === 0) return;
              } else {
                // Match the existing clip axis decision; a vertical layer reorder owns no duration popup.
                if (current.axis === "pending") {
                  if (Math.max(dx, dy) < 6) return;
                  current.axis = dy <= dx * 1.15 ? "time" : "reorder";
                }
                if (current.axis !== "time") return;
              }
              current.active = true;
              changeOpen(true);
            }}
            onPointerMove={(event) => {
              props.onPointerMove?.(event);
              // The gesture owns entry/exit while held; do not arm Radix's delayed hover too.
              if (held.current) event.preventDefault();
            }}
            onPointerUpCapture={(event) => {
              props.onPointerUpCapture?.(event);
              release(event.pointerId);
            }}
            onPointerCancelCapture={(event) => {
              props.onPointerCancelCapture?.(event);
              release(event.pointerId);
            }}
            onLostPointerCapture={(event) => {
              props.onLostPointerCapture?.(event);
              release(event.pointerId);
            }}
            onKeyDownCapture={(event) => {
              props.onKeyDownCapture?.(event);
              if (event.key === "Escape") release();
            }}
          >
            {children}
          </Slot.Root>
        </TooltipTrigger>
        <TooltipContent side="top">
          <span>
            {t("clipDuration")}
            {" · "}
          </span>
          <span data-motion-clip-tooltip={trackId} data-time-unit={unit} className="tabular-nums">
            {formatTimelineTime(subtractMotionTime(end, start), unit)} {unit}
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
