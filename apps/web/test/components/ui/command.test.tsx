import { expect, test, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "../../../src/components/ui/command";
test("provides shadcn/cmdk keyboard filtering, disabled items, groups and shortcuts", async () => {
  const choose = vi.fn();
  render(
    <Command label="Commands" loop>
      <CommandInput placeholder="Find" />
      <CommandList>
        <CommandEmpty>No matches</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={choose}>
            Save<CommandShortcut>Ctrl S</CommandShortcut>
          </CommandItem>
          <CommandItem disabled>Delete</CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Tools">
          <CommandItem>Hand</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>,
  );
  expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("option", { name: "Delete" })).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(screen.getByRole("option", { name: /Save.*Ctrl S/ }));
  expect(choose).toHaveBeenCalled();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "zzzzz" } });
  expect(await screen.findByText("No matches")).toBeInTheDocument();
});
test("labels the CommandDialog portal correctly and supports controlled closing", async () => {
  const onOpenChange = vi.fn();
  const d = render(
    <CommandDialog
      open
      title="Find anything"
      description="Tools and layers"
      onOpenChange={onOpenChange}
    >
      <CommandInput placeholder="Search" />
      <CommandList>
        <CommandItem>Rectangle</CommandItem>
      </CommandList>
    </CommandDialog>,
  );
  expect(screen.getByRole("dialog")).toHaveAccessibleName("Find anything");
  expect(screen.getByRole("dialog")).toHaveAccessibleDescription("Tools and layers");
  fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  d.unmount();
  render(
    <CommandDialog open showCloseButton={false}>
      <CommandInput />
      <CommandList>
        <CommandEmpty>None</CommandEmpty>
      </CommandList>
    </CommandDialog>,
  );
  expect(screen.getByRole("dialog")).toHaveAccessibleName("Command Palette");
});
