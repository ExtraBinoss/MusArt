import type { ReactNode } from "react";
import { PanelBottomClose, PanelBottomOpen, Pin, PinOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EnginePort } from "@musart/core";
import { TimelineIconButton } from "./ControlButton";
import { AudioLibrary } from "./audio/AudioLibrary";

/** Audio and dock actions share desktop and compact timelines without owning temporal state. */
export function TimelineActions({
  engine,
  active,
  onError,
  compact = false,
  onPin,
  pinned,
  expanded,
  onClose,
  children,
}: {
  engine: EnginePort;
  active: boolean;
  onError: (error: unknown) => void;
  compact?: boolean;
  onPin?: () => void;
  pinned?: boolean;
  expanded?: boolean;
  onClose?: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation("motion");
  return (
    <>
      <AudioLibrary engine={engine} disabled={!active} onError={onError} />
      {children}
      {!compact && (
        <TimelineIconButton
          label={t(onPin ? (pinned ? "unpin" : "pin") : expanded ? "close" : "open")}
          onClick={onPin ?? onClose}
          {...(onPin ? { "aria-pressed": pinned } : { "aria-expanded": expanded })}
        >
          {onPin ? (
            pinned ? (
              <PinOff size={14} />
            ) : (
              <Pin size={14} />
            )
          ) : expanded ? (
            <PanelBottomClose size={14} />
          ) : (
            <PanelBottomOpen size={14} />
          )}
        </TimelineIconButton>
      )}
    </>
  );
}
