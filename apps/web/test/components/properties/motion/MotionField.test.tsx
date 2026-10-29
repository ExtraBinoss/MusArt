import { fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { planMotionInitialization } from "@musart/core";
import { MotionField } from "../../../../src/components/properties/motion/MotionField";
import { MotionFieldProvider } from "../../../../src/components/properties/motion/context";
import { setup } from "../../../support/ui";
test("captures the intended field before pointer/focus input but never treats a diamond as a value gesture", () => {
  const d = setup(),
    begin = vi.fn();
  d.engine.execute({
    type: "setCompositionMode",
    mode: "motion",
    plan: planMotionInitialization(d.engine.getSnapshot()),
  });
  const target = { kind: "layer" as const, layerId: d.rectangle.id, property: "x" as const };
  const view = d.mount(
    <MotionFieldProvider editor={{ begin }}>
      <MotionField engine={d.engine} target={target} label="X">
        <input aria-label="Value" />
      </MotionField>
    </MotionFieldProvider>,
  );
  fireEvent.focus(screen.getByLabelText("Value"));
  expect(begin).toHaveBeenCalledWith(target);
  begin.mockClear();
  fireEvent.pointerDown(screen.getByRole("button", { name: "Ajouter une image clé · X" }));
  expect(begin).not.toHaveBeenCalled();
  view.rerender(
    <MotionField label="Base">
      <input aria-label="Base value" />
    </MotionField>,
  );
  expect(screen.queryByRole("button")).toBeNull();
});
