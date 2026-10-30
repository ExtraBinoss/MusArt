import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { motionTimeToSeconds } from "@musart/core";
import { Popover, PopoverAnchor, PopoverContent } from "../../ui/popover";
import { ScrollShadow } from "../../shared/scroll/ScrollShadow";
import { useVirtualList } from "../../shared/scroll/use-virtual-list";
import type { TransitionRequest } from "./requests";
import "./messages";

/** A gap never silently chooses the first of several clips. The explicit list stays virtualized. */
export function TransitionOccurrenceChooser({
  request,
  onChoose,
  onClose,
}: {
  request: TransitionRequest;
  onChoose(this: void, trackId: string): void;
  onClose(this: void): void;
}) {
  const { t } = useTranslation("transitions");
  const viewport = useRef<HTMLDivElement>(null);
  const choices = request.choices ?? [];
  const { first, last, height, attachViewport } = useVirtualList(choices.length, 32, viewport, 3);
  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <PopoverAnchor asChild>
        <span
          aria-hidden
          style={{
            position: "fixed",
            left: request.point.x,
            top: request.point.y,
            width: 1,
            height: 1,
            pointerEvents: "none",
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        aria-label={t("chooseOccurrence")}
        data-canvas-control
        data-keybinding-capture
      >
        <strong>{t("chooseOccurrence")}</strong>
        <p className="text-xs text-muted-foreground">{t("chooseOccurrenceHint")}</p>
        <ScrollShadow>
          <div
            ref={attachViewport}
            style={{ height: Math.min(256, choices.length * 32), overflow: "auto" }}
          >
            <div style={{ height: height, position: "relative" }}>
              {choices.slice(first, last).map((origin, offset) => {
                const index = first + offset;
                const page = origin.project.pages.find((page) => page.id === origin.compositionId)!;
                const track = page.motion!.tracks.find((track) => track.id === origin.trackId)!;
                const label = t("occurrenceInterval", {
                  number: index + 1,
                  start: motionTimeToSeconds(track.start).toFixed(3),
                  end: motionTimeToSeconds(track.end ?? page.motion!.duration).toFixed(3),
                });
                return (
                  <button
                    key={origin.trackId}
                    type="button"
                    className="w-full text-left text-xs rounded px-2 hover:bg-accent focus-visible:bg-accent"
                    style={{ position: "absolute", top: index * 32, height: 32 }}
                    onClick={() => onChoose(origin.trackId)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </ScrollShadow>
      </PopoverContent>
    </Popover>
  );
}
