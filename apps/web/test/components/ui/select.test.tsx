import { expect, test } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
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
test("renders grouped accessible options, labels and a separator with both content positions", async () => {
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
  const viewport = document.querySelector<HTMLElement>('[data-slot="select-viewport"]')!;
  expect(viewport.parentElement).toHaveClass("scroll-shadow", "select-scroll-shadow");
  const content = screen.getByRole("listbox");
  expect(content.style.maxHeight).toBe("var(--select-scroll-max-height)");
  const wrapper = content.parentElement!;
  await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  Object.defineProperties(viewport, {
    scrollHeight: { value: 500, configurable: true },
    clientHeight: { value: 100, configurable: true },
  });
  fireEvent.scroll(viewport, { target: { scrollTop: 0 } });
  await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  expect(document.querySelector('[data-slot="select-scroll-down-button"]')).not.toBeNull();
  wrapper.style.height = "120px";
  wrapper.style.minHeight = "80px";
  wrapper.style.bottom = "0px";
  fireEvent.scroll(viewport, { target: { scrollTop: 80 } });
  expect(document.querySelector('[data-slot="select-scroll-up-button"]')).not.toBeNull();
  expect(wrapper.style.height).toBe("120px");
  expect(viewport.scrollTop).toBe(80);
  expect(screen.getByRole("combobox", { hidden: true })).toHaveAttribute("data-state", "open");
  expect(document.querySelector('[data-slot="select-chevron"]')).toHaveClass("dropdown-chevron");
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
