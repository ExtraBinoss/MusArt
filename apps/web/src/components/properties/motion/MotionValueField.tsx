import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import {
  resolveMotionProperty,
  type EnginePort,
  type MotionPropertyTarget,
  type MotionValue,
} from "@musart/core";
import { createMotionTransport } from "../../../services/motion/transport";

/** Discrete controls and paint editors subscribe at the leaf, never the inspector/App roots. */
export function MotionValueField({
  engine,
  target,
  targets,
  fallback,
  children,
}: {
  engine?: EnginePort;
  target?: MotionPropertyTarget;
  targets?: readonly MotionPropertyTarget[];
  fallback: MotionValue;
  children: (value: MotionValue) => ReactNode;
}) {
  return engine && target ? (
    <LiveValue engine={engine} target={target} targets={targets} fallback={fallback}>
      {children}
    </LiveValue>
  ) : (
    children(fallback)
  );
}
function LiveValue({
  engine,
  target,
  targets,
  fallback,
  children,
}: {
  engine: EnginePort;
  target: MotionPropertyTarget;
  targets?: readonly MotionPropertyTarget[];
  fallback: MotionValue;
  children: (value: MotionValue) => ReactNode;
}) {
  const key = JSON.stringify(targets ?? [target]);
  const source = useMemo(() => {
    const addresses = JSON.parse(key) as MotionPropertyTarget[];
    const transport = createMotionTransport(engine);
    return {
      subscribe: transport.subscribe,
      read: () => {
        const snapshot = engine.getSnapshot();
        const page =
          transport.readFrame() ??
          snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
        const values = addresses.map((address) => resolveMotionProperty(page, address)?.value);
        return values.some((value) => value !== values[0]) ? "mixed" : (values[0] ?? fallback);
      },
    };
  }, [engine, key, fallback]);
  const value = useSyncExternalStore(source.subscribe, source.read, source.read);
  return children(value);
}
