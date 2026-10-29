import { act, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { planMotionInitialization } from "@musart/core";
import { MotionValueField } from "../../../../src/components/properties/motion/MotionValueField";
import { createMotionTransport } from "../../../../src/services/motion/transport";
import { setup } from "../../../support/ui";
test("discrete values only rerender their leaf when the actual value changes", () => {
  const d = setup();
  d.engine.execute({
    type: "setCompositionMode",
    mode: "motion",
    plan: planMotionInitialization(d.engine.getSnapshot()),
  });
  const target = { kind: "layer" as const, layerId: d.rectangle.id, property: "visible" as const };
  d.engine.transaction([
    { type: "upsertMotionKeyframe", target, time: { value: 0, rate: 1 }, value: true },
    { type: "upsertMotionKeyframe", target, time: { value: 1, rate: 1 }, value: false },
  ]);
  let roots = 0,
    leaves = 0;
  function Harness() {
    roots++;
    return (
      <MotionValueField engine={d.engine} target={target} fallback>
        {(value) => {
          leaves++;
          return <span>{String(value)}</span>;
        }}
      </MotionValueField>
    );
  }
  d.mount(<Harness />);
  expect(screen.getByText("true")).toBeVisible();
  const before = leaves;
  act(() => createMotionTransport(d.engine).seek({ value: 1, rate: 2 }));
  expect(leaves).toBe(before);
  act(() => createMotionTransport(d.engine).seek({ value: 1, rate: 1 }));
  expect(screen.getByText("false")).toBeVisible();
  expect(roots).toBe(1);
});
