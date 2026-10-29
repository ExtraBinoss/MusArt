import type { ReactNode } from "react";
import type { EnginePort, MotionPropertyTarget } from "@musart/core";
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
  if (!engine || !target) return children;
  return (
    <div
      className={`motion-property-field ${className}`}
      onPointerDownCapture={(event) => {
        if (!(event.target as Element).closest("[data-motion-diamond]"))
          (editor?.start ?? editor?.begin)?.(captureTarget ? (targets ?? target) : undefined);
      }}
      onFocusCapture={(event) => {
        if (!(event.target as Element).closest("[data-motion-diamond]"))
          (editor?.start ?? editor?.begin)?.(captureTarget ? (targets ?? target) : undefined);
      }}
    >
      <div className="motion-property-input">{children}</div>
      <MotionDiamond
        engine={engine}
        target={target}
        targets={targets}
        label={label}
        disabled={disabled}
      />
    </div>
  );
}
