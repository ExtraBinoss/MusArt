import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { Tabs } from "../../../../src/components/ui/tabs";
import { DashboardTabs } from "../../../../src/components/projects/dashboard/DashboardTabs";
import { setup } from "../../../support/ui";
let reduced = false;
vi.mock("motion/react", async (original) => ({
  ...(await original<typeof import("motion/react")>()),
  useReducedMotion: () => reduced,
}));
afterEach(() => {
  reduced = false;
});
test("genuine tabs preserve one selected section and one shared visual indicator", () => {
  const d = setup();
  function Live() {
    const [value, setValue] = useState("projects");
    return (
      <Tabs value={value} onValueChange={setValue}>
        <DashboardTabs value={value} />
      </Tabs>
    );
  }
  d.mount(<Live />);
  expect(screen.getAllByRole("tab")).toHaveLength(2);
  expect(screen.getByRole("tab", { name: "Projets" })).toHaveAttribute("aria-selected", "true");
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Templates" }), { button: 0 });
  expect(screen.getByRole("tab", { name: "Templates" })).toHaveAttribute("aria-selected", "true");
  expect(document.querySelectorAll(".dashboard-tab-indicator")).toHaveLength(1);
});
test("busy sections cannot switch, including when reduced motion is preferred", () => {
  reduced = true;
  const change = vi.fn();
  setup().mount(
    <Tabs value="projects" onValueChange={change}>
      <DashboardTabs value="projects" disabled />
    </Tabs>,
  );
  for (const tab of screen.getAllByRole("tab")) expect(tab).toBeDisabled();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Templates" }), { button: 0 });
  expect(change).not.toHaveBeenCalled();
});
