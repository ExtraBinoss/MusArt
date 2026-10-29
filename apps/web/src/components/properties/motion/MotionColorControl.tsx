import type { ComponentProps } from "react";
import type { EnginePort, MotionPropertyTarget } from "@musart/core";
import { ColorControl } from "../ColorControl";
import { MotionField } from "./MotionField";
import { MotionValueField } from "./MotionValueField";
import { motionTimeChanges } from "../../../state/session/motion-edit";

export function MotionColorControl({
  engine,
  target,
  label,
  ...props
}: ComponentProps<typeof ColorControl> & {
  engine?: EnginePort;
  target?: MotionPropertyTarget;
  label: string;
}) {
  return (
    <MotionField
      engine={engine}
      target={target}
      label={label}
      disabled={props.disabled}
      className="motion-property-paint"
    >
      <MotionValueField engine={engine} target={target} fallback={props.value}>
        {(value) => (
          <ColorControl
            {...props}
            invalidation={engine ? motionTimeChanges(engine) : undefined}
            value={String(value)}
          />
        )}
      </MotionValueField>
    </MotionField>
  );
}
