import { useState } from "react";
import { expect, test } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { Tabs, TabsContent } from "../../../../src/components/ui/tabs";
import { SegmentedTabs } from "../../../../src/components/shared/segmented/SegmentedTabs";
import { setup } from "../../../support/ui";

test("uses real controlled Radix tabs with one instance-scoped active indicator", () => {
  function Picker() {
    const [value, setValue] = useState("all");
    return (
      <Tabs value={value} onValueChange={setValue}>
        <SegmentedTabs
          value={value}
          size="compact"
          label="Formats"
          items={[
            { value: "all", label: "All" },
            { value: "social", label: "Social" },
          ]}
        />
        <TabsContent value="all">All formats</TabsContent>
        <TabsContent value="social">Social formats</TabsContent>
      </Tabs>
    );
  }
  const view = setup().mount(<Picker />);
  expect(screen.getByRole("tablist", { name: "Formats" })).toHaveAttribute("data-size", "compact");
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Social" }), { button: 0 });
  expect(screen.getByRole("tab", { name: "Social" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("Social formats")).toBeVisible();
  expect(document.querySelectorAll(".segmented-tab-indicator")).toHaveLength(1);
  view.rerender(
    <Tabs value="all">
      <SegmentedTabs
        value="all"
        label="Disabled formats"
        disabled
        items={[{ value: "all", label: "All" }]}
      />
    </Tabs>,
  );
  expect(screen.getByRole("tab", { name: "All" })).toBeDisabled();
});

test("tooltips preserve genuine radio data-state and keyboard choice semantics", () => {
  function Picker() {
    const [value, setValue] = useState("static");
    return (
      <SegmentedTabs
        mode="choice"
        value={value}
        onValueChange={setValue}
        tooltips
        label="Composition mode"
        items={[
          { value: "static", label: "Static" },
          { value: "motion", label: "Motion" },
        ]}
      />
    );
  }
  setup().mount(<Picker />);
  const current = screen.getByRole("radio", { name: "Static" });
  expect(current).toHaveAttribute("data-state", "checked");
  fireEvent.click(screen.getByRole("radio", { name: "Motion" }));
  expect(current).toHaveAttribute("data-state", "unchecked");
  expect(screen.getByRole("radio", { name: "Motion" })).toHaveAttribute("data-state", "checked");
});
test("value choices reuse the surface with genuine radio semantics and a single controlled selection", () => {
  function Picker() {
    const [value, setValue] = useState("light");
    return (
      <SegmentedTabs
        mode="choice"
        value={value}
        onValueChange={setValue}
        label="Theme"
        size="compact"
        items={[
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
      />
    );
  }
  const view = setup().mount(<Picker />);
  expect(screen.getByRole("radiogroup", { name: "Theme" })).toHaveClass("segmented-tabs");
  expect(screen.queryByRole("tablist")).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
  expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "Light" })).not.toBeChecked();
  expect(document.querySelectorAll(".segmented-tab-indicator")).toHaveLength(1);
  view.rerender(
    <SegmentedTabs
      mode="choice"
      value="light"
      onValueChange={() => undefined}
      label="Disabled theme"
      disabled
      items={[{ value: "light", label: "Light" }]}
    />,
  );
  expect(screen.getByRole("radio", { name: "Light" })).toBeDisabled();
});

test("tabs and radio choices use the same explicit icon and label slots", () => {
  const view = setup().mount(
    <Tabs value="projects">
      <SegmentedTabs
        value="projects"
        label="Library"
        items={[{ value: "projects", label: "Projects", icon: <svg width="17" height="17" /> }]}
      />
    </Tabs>,
  );
  const tab = screen.getByRole("tab", { name: "Projects" });
  expect(tab.querySelector(".segmented-tab-icon > svg")).not.toBeNull();
  expect(tab.querySelector(".segmented-tab-icon")).toHaveAttribute("aria-hidden", "true");
  expect(tab.querySelector(".segmented-tab-label")).toHaveTextContent("Projects");
  view.rerender(
    <SegmentedTabs
      mode="choice"
      value="static"
      onValueChange={() => undefined}
      label="Mode"
      items={[{ value: "static", label: "Static", icon: <svg width="15" height="15" /> }]}
    />,
  );
  const radio = screen.getByRole("radio", { name: "Static" });
  expect(radio.querySelector(".segmented-tab-icon > svg")).not.toBeNull();
  expect(radio.querySelector(".segmented-tab-label")).toHaveTextContent("Static");
});
