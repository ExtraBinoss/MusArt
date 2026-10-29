import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { createEffect, planMotionInitialization } from "@musart/core";
import { MotionDiamond } from "../../../../src/components/properties/motion/MotionDiamond";
import { createMotionTransport } from "../../../../src/services/motion/transport";
import { setup } from "../../../support/ui";
test("adds the first real key and imperatively reflects playhead, mode and lock changes", () => {
  const d = setup();
  d.engine.execute({
    type: "setCompositionMode",
    mode: "motion",
    plan: planMotionInitialization(d.engine.getSnapshot()),
  });
  let renders = 0;
  function Harness() {
    renders++;
    return (
      <MotionDiamond
        engine={d.engine}
        target={{ kind: "layer", layerId: d.rectangle.id, property: "x" }}
        label="X"
      />
    );
  }
  d.mount(<Harness />);
  const button = screen.getByRole("button", { name: "Ajouter une image clé · X" });
  fireEvent.click(button);
  expect(button).toHaveAttribute("data-current", "true");
  expect(
    d.engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!.properties[0]!.keyframes[0]!.value,
  ).toBe(20);
  const before = renders;
  act(() => createMotionTransport(d.engine).seek({ value: 1, rate: 1 }));
  expect(button).toHaveAttribute("data-current", "false");
  expect(button).toHaveAttribute("data-animated", "true");
  expect(renders).toBe(before);
  act(() =>
    d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { locked: true } }),
  );
  expect(button).toBeDisabled();
  act(() => d.engine.execute({ type: "setCompositionMode", mode: "static" }));
  expect(button).not.toBeVisible();
});
test("advertises preset macros honestly instead of keying an inert preset selector", () => {
  const d = setup(),
    effect = createEffect("gradient");
  d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { effects: [effect] } });
  d.engine.execute({
    type: "setCompositionMode",
    mode: "motion",
    plan: planMotionInitialization(d.engine.getSnapshot()),
  });
  d.mount(
    <MotionDiamond
      engine={d.engine}
      target={{
        kind: "effectSetting",
        layerId: d.rectangle.id,
        effectId: effect.id,
        property: "preset",
      }}
      label="Preset"
    />,
  );
  const button = screen.getByRole("button", { name: "Ajouter une image clé · Preset" });
  expect(button).toBeDisabled();
  expect(button.title).toContain("plusieurs paramètres");
});

test("uses sorted key lookup and avoids identical attribute mutations during continuous non-key seeks", async () => {
  const d = setup(),
    target = { kind: "layer", layerId: d.rectangle.id, property: "x" } as const;
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.engine.transaction(
    Array.from({ length: 500 }, (_, index) => ({
      type: "upsertMotionKeyframe",
      target,
      time: { value: index, rate: 250 },
      value: index,
    })),
  );
  const view = d.mount(<MotionDiamond engine={d.engine} target={target} label="X" />);
  const node = screen.getByRole("button", { name: "Modifier l’image clé · X" });
  const transport = createMotionTransport(d.engine),
    records: MutationRecord[] = [];
  const observer = new MutationObserver((changes) => {
    records.push(...changes);
  });
  observer.observe(node, { attributes: true });
  act(() => transport.seek({ value: 2001, rate: 10000 }));
  await Promise.resolve();
  records.length = 0;
  act(() => {
    for (let index = 1; index <= 60; index++)
      transport.seek({ value: 2001 + index * 10, rate: 10000 });
  });
  await Promise.resolve();
  expect(records).toHaveLength(0);
  expect(node).toHaveAttribute("data-current", "false");
  act(() => transport.seek({ value: 1, rate: 2 }));
  expect(node).toHaveAttribute("data-current", "true");
  act(() => transport.seek({ value: 499, rate: 250 }));
  expect(node).toHaveAttribute("data-current", "true");
  act(() => transport.seek({ value: 0, rate: 1 }));
  expect(node).toHaveAttribute("data-current", "true");
  observer.disconnect();
  view.unmount();
});
