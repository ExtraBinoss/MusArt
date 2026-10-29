import { expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import {
  MotionFieldProvider,
  useMotionFieldEditor,
} from "../../../../src/components/properties/motion/context";
import { setup } from "../../../support/ui";
test("exposes explicit editor ownership and leaves isolated controls unbound", () => {
  const d = setup(),
    begin = vi.fn();
  function Probe() {
    return <span>{useMotionFieldEditor()?.begin === begin ? "bound" : "unbound"}</span>;
  }
  const view = d.mount(<Probe />);
  expect(screen.getByText("unbound")).toBeVisible();
  view.rerender(
    <MotionFieldProvider editor={{ begin }}>
      <Probe />
    </MotionFieldProvider>,
  );
  expect(screen.getByText("bound")).toBeVisible();
});
