import { useMemo } from "react";
import {
  compareMotionTime,
  resolveMotionProperty,
  type EnginePort,
  type MotionPropertyTarget,
} from "@musart/core";
import { createMotionTransport } from "../../../services/motion/transport";
import { NumberInput, type NumberInputProps } from "../../shared/NumberInput";
import { MotionField } from "./MotionField";

interface Props extends NumberInputProps {
  engine?: EnginePort;
  target?: MotionPropertyTarget;
  displayScale?: number;
  targets?: readonly MotionPropertyTarget[];
  keyframeTargets?: readonly MotionPropertyTarget[];
}
export function MotionNumberInput(props: Props) {
  return props.engine && props.target ? (
    <LiveNumber {...props} engine={props.engine} target={props.target} />
  ) : (
    <NumberInput {...props} />
  );
}
function LiveNumber({
  engine,
  target,
  targets,
  keyframeTargets,
  displayScale = 1,
  ...props
}: Props & { engine: EnginePort; target: MotionPropertyTarget }) {
  const key = JSON.stringify(targets ?? [target]);
  const presentation = useMemo(() => {
    const addresses = JSON.parse(key) as MotionPropertyTarget[];
    const transport = createMotionTransport(engine);
    const read = () => {
      const snapshot = engine.getSnapshot();
      const page =
        transport.readFrame() ??
        snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
      const values = addresses.map((address) => resolveMotionProperty(page, address)?.value);
      return typeof values[0] !== "number"
        ? props.value
        : values.some((value) => value !== values[0])
          ? null
          : values[0] * displayScale;
    };
    return {
      read,
      subscribe: (listener: () => void) => {
        let before = transport.read(),
          value = read();
        return transport.subscribe(() => {
          const next = transport.read(),
            nextValue = read();
          const changed =
            !Object.is(value, nextValue) ||
            before.mode !== next.mode ||
            before.compositionId !== next.compositionId ||
            compareMotionTime(before.time, next.time) !== 0;
          before = next;
          value = nextValue;
          if (changed) listener();
        });
      },
    };
  }, [engine, key, displayScale, props.value]);
  const live = presentation.read();
  return (
    <MotionField
      engine={engine}
      target={target}
      targets={keyframeTargets ?? targets}
      label={props.label}
      disabled={props.disabled}
    >
      <NumberInput
        {...props}
        presentation={presentation}
        value={live ?? props.value}
        mixed={live === null}
      />
    </MotionField>
  );
}
