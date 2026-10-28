import { beforeAll, expect, test, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { translations } from "../../../src/state/i18n/catalogs";
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
const english = createInstance();
beforeAll(async () => {
  await english.init({
    resources: translations,
    lng: "en",
    fallbackLng: "en",
    initAsync: false,
  });
});
function Locale({ children }: { children: ReactNode }) {
  return <I18nextProvider i18n={english}>{children}</I18nextProvider>;
}
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
    { wrapper: Locale },
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
    { wrapper: Locale },
  );
  expect(screen.getByRole("dialog")).toHaveAccessibleName("Find anything");
  expect(screen.getByRole("dialog")).toHaveAccessibleDescription("Tools and layers");
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  d.unmount();
  render(
    <CommandDialog open showCloseButton={false}>
      <CommandInput />
      <CommandList>
        <CommandEmpty>None</CommandEmpty>
      </CommandList>
    </CommandDialog>,
    { wrapper: Locale },
  );
  expect(screen.getByRole("dialog")).toHaveAccessibleName("Command Palette");
  expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
});
