import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TimelineIconButton } from "../ControlButton";
import { TransitionPopover } from "../transitions/TransitionPopover";
import { captureTransitionOrigin, type TransitionOrigin } from "../transitions/authoring";

import "../transitions/messages";

type Props = Pick<
  ComponentProps<typeof TransitionPopover>,
  "engine" | "compositionId" | "layerId" | "trackId" | "transport" | "disabled"
>;
/** Virtual labels mount the real editor only on activation, retaining its validated capture contract. */
export function TimelineMotionAction(props: Props) {
  const { engine, compositionId, layerId, trackId, transport, disabled } = props;
  const { t } = useTranslation("transitions");
  const [origin, setOrigin] = useState<TransitionOrigin | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  useEffect(() => {
    if (!origin) return;
    const check = () => {
      const snapshot = engine.getSnapshot();
      if (
        snapshot.project !== origin.project ||
        snapshot.pageId !== compositionId ||
        snapshot.revision !== origin.revision
      )
        setOrigin(null);
    };
    check();
    return engine.subscribe(check);
  }, [engine, origin, compositionId]);
  useLayoutEffect(() => {
    if (!origin && returnFocus.current) {
      returnFocus.current = false;
      button.current?.focus({ preventScroll: true });
    }
  }, [origin]);
  const trigger = (
    <TimelineIconButton
      ref={button}
      className="motion-transition-trigger"
      label={t("add")}
      disabled={disabled}
      aria-haspopup="dialog"
      aria-expanded={!!origin}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={() => {
        if (disabled) return;
        transport.pause();
        setOrigin(
          captureTransitionOrigin(engine, compositionId, layerId, trackId, transport.read().time),
        );
      }}
    >
      <Sparkles size={13} />
    </TimelineIconButton>
  );
  return origin ? (
    <TransitionPopover
      {...props}
      initialOrigin={origin}
      anchor={trigger}
      onClose={() => {
        returnFocus.current = true;
        setOrigin(null);
      }}
    />
  ) : (
    trigger
  );
}
