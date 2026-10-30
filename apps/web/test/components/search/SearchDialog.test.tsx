import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SearchDialog } from "../../../src/components/search/SearchDialog";
import { DialogTitle, DialogDescription } from "../../../src/components/ui/dialog";
import { setup } from "../../support/ui";

test("focuses immediately and keeps closing content inert until visual presence releases Radix ownership", async () => {
  const d = setup(),
    close = vi.fn(),
    content = (
      <>
        <DialogTitle>Search motion</DialogTitle>
        <DialogDescription>Commands</DialogDescription>
        <input aria-label="Query" autoFocus />
      </>
    );
  const view = d.mount(
    <SearchDialog open onOpenChange={vi.fn()} reduced={false} onCloseAutoFocus={close}>
      {content}
    </SearchDialog>,
  );
  expect(screen.getByRole("textbox", { name: "Query" })).toHaveFocus();
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveStyle({ pointerEvents: "auto" });
  view.rerender(
    <SearchDialog open={false} onOpenChange={vi.fn()} reduced={false} onCloseAutoFocus={close}>
      {content}
    </SearchDialog>,
  );
  expect(dialog).toHaveAttribute("inert");
  expect(dialog).toHaveAttribute("aria-hidden", "true");
  expect(dialog).toHaveStyle({ pointerEvents: "none" });
  await waitFor(() => expect(dialog).not.toBeInTheDocument());
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
});
test("reduced motion skips visual entrance and Escape keeps the real Radix close callback", async () => {
  const d = setup(),
    change = vi.fn();
  d.mount(
    <SearchDialog open reduced onOpenChange={change}>
      <DialogTitle>Reduced search</DialogTitle>
      <DialogDescription>Commands</DialogDescription>
      <input aria-label="Query" autoFocus />
    </SearchDialog>,
  );
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveStyle({ opacity: "1" });
  await act(async () => {
    await Promise.resolve();
  });
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(change).toHaveBeenCalledExactlyOnceWith(false);
});

test("Escape preserves IME composition and forwards the native handler before ordinary dismissal", async () => {
  const d = setup(),
    change = vi.fn(),
    escape = vi.fn();
  d.mount(
    <SearchDialog open reduced onOpenChange={change} onEscapeKeyDown={escape}>
      <DialogTitle>Composition search</DialogTitle>
      <DialogDescription>Commands</DialogDescription>
      <input aria-label="Query" autoFocus />
    </SearchDialog>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  const input = screen.getByRole("textbox", { name: "Query" });
  for (const composition of [{ isComposing: true }, { keyCode: 229 }]) {
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
      ...composition,
    });
    fireEvent(input, event);
    expect(event.defaultPrevented).toBe(true);
    expect(escape).toHaveBeenLastCalledWith(event);
    expect(change).not.toHaveBeenCalled();
    expect(input).toHaveFocus();
  }
  fireEvent.keyDown(input, { key: "Escape" });
  expect(escape).toHaveBeenCalledTimes(3);
  expect(change).toHaveBeenCalledExactlyOnceWith(false);
});
