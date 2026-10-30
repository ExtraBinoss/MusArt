import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { FontPickerSearch } from "../../../../src/components/properties/fonts/FontPickerSearch";
import { i18n } from "../../../../src/state/i18n";

test("keeps combobox navigation and current input immediate while ignoring composition Enter", () => {
  void i18n.changeLanguage("fr");
  const onMove = vi.fn(),
    onChoose = vi.fn(),
    onQuery = vi.fn();
  render(
    <FontPickerSearch
      id="fonts-query"
      listId="fonts-list"
      activeId="font-inter"
      hints={[]}
      query="Inter"
      onMove={onMove}
      onChoose={onChoose}
      onQuery={onQuery}
    />,
  );
  const input = screen.getByRole("combobox", { name: "Rechercher une police" });
  expect(input).toHaveAttribute("aria-controls", "fonts-list");
  fireEvent.change(input, { target: { value: "Lora" } });
  expect(onQuery).toHaveBeenCalledWith("Lora");
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(onMove).toHaveBeenCalledWith(1);
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  expect(onChoose).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter" });
  expect(onChoose).toHaveBeenCalledOnce();
});
