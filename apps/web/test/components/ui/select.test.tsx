import { expect, test } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "../../../src/components/ui/select";
test("renders grouped accessible options, labels and a separator with both content positions", () => {
  const view = render(
    <Select defaultOpen defaultValue="one">
      <SelectTrigger aria-label="List">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Formats</SelectLabel>
          <SelectItem value="one">One</SelectItem>
          <SelectSeparator />
          <SelectItem value="two">Two</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>,
  );
  expect(screen.getByRole("option", { name: "One" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("Formats")).toBeVisible();
  expect(screen.getByRole("combobox", { hidden: true })).toHaveAttribute("data-state", "open");
  expect(document.querySelector('[data-slot="select-chevron"]')).toHaveClass(
    "group-data-[state=open]/select-trigger:rotate-180",
    "motion-reduce:transition-none",
  );
  fireEvent.click(screen.getByRole("option", { name: "Two" }));
  expect(screen.getByRole("combobox")).toHaveTextContent("Two");
  view.unmount();
  render(
    <Select open defaultValue="one">
      <SelectTrigger size="sm" aria-label="List">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectItem value="one">One</SelectItem>
      </SelectContent>
    </Select>,
  );
  expect(screen.getByRole("combobox", { hidden: true })).toHaveAttribute("data-size", "sm");
});
