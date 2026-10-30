import { useLayoutEffect, useRef, type ReactNode } from "react";
import { getMotionOccurrenceAt, type EnginePort, type MotionPropertyTarget } from "@musart/core";
import { useTranslation } from "react-i18next";
import { createMotionTransport } from "../../../services/motion/transport";
import { MotionDiamond } from "./MotionDiamond";
import { useMotionFieldEditor } from "./context";

export function MotionField({
  engine,
  target,
  targets,
  label,
  disabled,
  children,
  className = "",
  captureTarget = true,
}: {
  engine?: EnginePort;
  target?: MotionPropertyTarget;
  label: string;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  targets?: readonly MotionPropertyTarget[];
  captureTarget?: boolean;
}) {
  const editor = useMotionFieldEditor();
  const { t } = useTranslation("motionProperties");
  const wrapper = useRef<HTMLFieldSetElement>(null);
  const input = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!engine || !target) return;
    const transport = createMotionTransport(engine);
    let previous: boolean | undefined;
    const update = () => {
      const snapshot = engine.getSnapshot(),
        state = transport.read();
      const page = snapshot.project.pages.find((page) => page.id === snapshot.pageId)!;
      const absent =
        state.mode === "motion" &&
        (targets ?? [target]).some(
          (address) =>
            !getMotionOccurrenceAt(page, address.layerId, state.time, { terminalPreview: true }),
        );
      const blocked = Boolean(disabled || absent);
      if (blocked === previous) return;
      previous = blocked;
      if (wrapper.current) {
        wrapper.current.disabled = blocked;
        wrapper.current.setAttribute("aria-disabled", String(blocked));
        wrapper.current.title = absent ? t("inactive") : "";
      }
      if (input.current) input.current.inert = blocked;
    };
    update();
    return transport.subscribe(update);
  }, [engine, target, targets, disabled, t]);
  if (!engine || !target) return children;
  return (
    <fieldset
      ref={wrapper}
      role="presentation"
      className={`motion-property-field ${className}`}
      onPointerDownCapture={(event) => {
        if (
          !event.currentTarget.disabled &&
          !(event.target as Element).closest("[data-motion-diamond]")
        )
          (editor?.start ?? editor?.begin)?.(captureTarget ? (targets ?? target) : undefined);
      }}
      onFocusCapture={(event) => {
        if (
          !event.currentTarget.disabled &&
          !(event.target as Element).closest("[data-motion-diamond]")
        )
          (editor?.start ?? editor?.begin)?.(captureTarget ? (targets ?? target) : undefined);
      }}
    >
      <div ref={input} className="motion-property-input">
        {children}
      </div>
      <MotionDiamond
        engine={engine}
        target={target}
        targets={targets}
        label={label}
        disabled={disabled}
      />
    </fieldset>
  );
}
