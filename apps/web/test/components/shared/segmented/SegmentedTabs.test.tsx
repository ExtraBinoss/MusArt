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
