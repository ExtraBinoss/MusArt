import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { planMotionInitialization } from "@musart/core";
import { MotionNumberInput } from "../../../../src/components/properties/motion/MotionNumberInput";
import { addMotionPropertyKey } from "../../../../src/state/session/motion-edit";
import { createMotionTransport } from "../../../../src/services/motion/transport";
import { setup } from "../../../support/ui";
test("animated numbers update the existing native field without React renders and cancel a stale typed gesture", () => {
  const d = setup(),
    commit = vi.fn(),
    cancel = vi.fn();
  d.engine.execute({
    type: "setCompositionMode",
    mode: "motion",
    plan: planMotionInitialization(d.engine.getSnapshot()),
  });
  const target = { kind: "layer" as const, layerId: d.rectangle.id, property: "x" as const };
  addMotionPropertyKey(d.engine, target);
  d.engine.execute({
    type: "upsertMotionKeyframe",
    target,
    time: { value: 1, rate: 1 },
    value: 100,
  });
  let renders = 0;
  function Harness() {
    renders++;
    return (
      <MotionNumberInput
        engine={d.engine}
        target={target}
        label="X"
        value={20}
        onCommit={commit}
        onCancel={cancel}
      />
    );
  }
  d.mount(<Harness />);
  const field = screen.getByRole("textbox", { name: "X" }),
    before = renders;
  act(() => createMotionTransport(d.engine).seek({ value: 1, rate: 1 }));
  expect(field).toHaveValue("100");
  expect(renders).toBe(before);
  fireEvent.change(field, { target: { value: "999" } });
  act(() => createMotionTransport(d.engine).seek({ value: 1, rate: 2 }));
  expect(field).toHaveValue("60");
  expect(cancel).toHaveBeenCalled();
  fireEvent.keyDown(field, { key: "Escape" });
  expect(commit).not.toHaveBeenCalled();
  act(() => d.engine.execute({ type: "setCompositionMode", mode: "static" }));
  expect(field).toHaveValue("20");
});
test("isolated/base fields remain usable without an animation engine", () => {
  const d = setup(),
    commit = vi.fn();
  d.mount(<MotionNumberInput label="Base" value={5} onCommit={commit} />);
  const field = screen.getByLabelText("Base");
  fireEvent.change(field, { target: { value: "8" } });
  fireEvent.blur(field);
  expect(commit).toHaveBeenCalledWith(8);
});
