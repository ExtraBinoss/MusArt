import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { planMotionInitialization } from "@musart/core";
import { MotionField } from "../../../../src/components/properties/motion/MotionField";
import { MotionFieldProvider } from "../../../../src/components/properties/motion/context";
import { setup } from "../../../support/ui";
import { createMotionTransport } from "../../../../src/services/motion/transport";
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

test("imperatively disables native and custom property targets in a gap and restores them inside a clip", () => {
  const d = setup(),
    begin = vi.fn();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const id = d.engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!.id;
  d.engine.execute({
    type: "duplicateMotionOccurrence",
    trackId: id,
    start: { value: 3, rate: 1 },
  });
  const target = { kind: "layer", layerId: d.rectangle.id, property: "x" } as const;
  let renders = 0;
  function Harness() {
    renders++;
    return (
      <MotionFieldProvider editor={{ begin }}>
        <MotionField engine={d.engine} target={target} label="X">
          <input aria-label="Occurrence value" />
        </MotionField>
      </MotionFieldProvider>
    );
  }
  d.mount(<Harness />);
  const field = screen.getByLabelText("Occurrence value"),
    before = renders;
  const transport = createMotionTransport(d.engine);
  act(() => transport.seek({ value: 5, rate: 2 }));
  expect(field).toBeDisabled();
  fireEvent.focus(field);
  expect(begin).not.toHaveBeenCalled();
  act(() => transport.seek({ value: 7, rate: 2 }));
  expect(field).not.toBeDisabled();
  expect(renders).toBe(before);
});
