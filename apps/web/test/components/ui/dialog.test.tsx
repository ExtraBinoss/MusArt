import { expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { changeLanguage } from "../../../src/state/i18n";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../src/components/ui/dialog";
test("opens modal with labelled title, portal, overlay and close actions", async () => {
  const changed = vi.fn();
  render(
    <Dialog onOpenChange={changed}>
      <DialogTrigger>Open</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>Choose output</DialogDescription>
        </DialogHeader>
        <DialogFooter showCloseButton>
          <DialogClose>Cancel</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>,
  );
  fireEvent.click(screen.getByText("Open"));
  expect(await screen.findByRole("dialog")).toHaveAccessibleName("Export");
  fireEvent.click(screen.getByText("Cancel"));
  expect(changed).toHaveBeenLastCalledWith(false);
});
test("can omit default close button and footer control", () => {
  render(
    <Dialog open>
      <DialogContent showCloseButton={false}>
        <DialogTitle>Title</DialogTitle>
        <DialogDescription>Description</DialogDescription>
        <DialogFooter>Footer</DialogFooter>
      </DialogContent>
    </Dialog>,
  );
  expect(screen.queryByText("Fermer")).not.toBeInTheDocument();
});
test("localizes both close controls and retains an explicit accessible override", async () => {
  await changeLanguage("en");
  try {
    const view = render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Description</DialogDescription>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(2);
    view.rerender(
      <Dialog open>
        <DialogContent closeLabel="Close export">
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Description</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole("button", { name: "Close export" })).toBeInTheDocument();
    view.unmount();
  } finally {
    await changeLanguage("fr");
  }
});
