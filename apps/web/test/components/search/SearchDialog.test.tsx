import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SearchDialog } from "../../../src/components/search/SearchDialog";
import { DialogTitle, DialogDescription } from "../../../src/components/ui/dialog";
import { setup } from "../../support/ui";

const entrance = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));
vi.mock("motion/react", async (original) => {
  const actual = await original<typeof import("motion/react")>(),
    { useMemo } = await import("react");
  return {
    ...actual,
    useAnimationControls() {
      const controls = actual.useAnimationControls();
      return useMemo(
        () => ({
          ...controls,
          start: (...args: Parameters<typeof controls.start>) => {
            entrance.start(...args);
            return controls.start(...args);
          },
          stop: () => {
            entrance.stop();
            controls.stop();
          },
        }),
        [controls],
      );
    },
  };
});
beforeEach(() => {
  entrance.start.mockClear();
  entrance.stop.mockClear();
});
afterEach(() => vi.unstubAllGlobals());
function entranceClock() {
  let sequence = 0;
  const pending = new Map<number, FrameRequestCallback>();
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      pending.set(++sequence, callback);
      return sequence;
    }),
  );
  const cancel = vi.fn((id: number) => {
    pending.delete(id);
  });
  vi.stubGlobal("cancelAnimationFrame", cancel);
  return {
    pending,
    cancel,
    flush() {
      const callbacks = [...pending.values()];
      pending.clear();
      act(() => {
        for (const callback of callbacks) callback(performance.now());
      });
    },
  };
}
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
  expect(dialog).not.toHaveAttribute("aria-hidden");
  expect(dialog.contains(document.activeElement)).toBe(false);
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
  expect(entrance.start).not.toHaveBeenCalled();
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

test("focus is immediate while the panel entrance starts only at the first available RAF", () => {
  const clock = entranceClock(),
    d = setup();
  const view = d.mount(
    <SearchDialog open reduced={false} onOpenChange={vi.fn()}>
      <DialogTitle>Frame entrance</DialogTitle>
      <DialogDescription>Commands</DialogDescription>
      <input aria-label="Query" autoFocus />
    </SearchDialog>,
  );
  expect(screen.getByRole("textbox", { name: "Query" })).toHaveFocus();
  expect(screen.getByRole("dialog")).toHaveStyle({ opacity: "0" });
  expect(entrance.start).not.toHaveBeenCalled();
  expect(clock.pending.size).toBe(1);
  clock.flush();
  expect(entrance.start).toHaveBeenCalledExactlyOnceWith("visible");
  view.unmount();
  expect(entrance.stop).toHaveBeenCalledOnce();
  expect(clock.pending.size).toBe(0);
});
test("unmount before the first RAF cancels the entrance and rejects a retired callback", () => {
  const clock = entranceClock(),
    d = setup();
  const view = d.mount(
    <SearchDialog open reduced={false} onOpenChange={vi.fn()}>
      <DialogTitle>Cancelled entrance</DialogTitle>
      <DialogDescription>Commands</DialogDescription>
    </SearchDialog>,
  );
  const [id, callback] = [...clock.pending][0]!;
  view.unmount();
  expect(clock.cancel).toHaveBeenCalledWith(id);
  expect(clock.pending.size).toBe(0);
  act(() => callback(performance.now()));
  expect(entrance.start).not.toHaveBeenCalled();
  expect(entrance.stop).toHaveBeenCalledOnce();
});
test("closing before the entrance cancels its RAF without stopping the independent exit", () => {
  const clock = entranceClock(),
    d = setup(),
    content = (
      <>
        <DialogTitle>Closing entrance</DialogTitle>
        <DialogDescription>Commands</DialogDescription>
      </>
    );
  const view = d.mount(
    <SearchDialog open reduced={false} onOpenChange={vi.fn()}>
      {content}
    </SearchDialog>,
  );
  const [id, callback] = [...clock.pending][0]!;
  view.rerender(
    <SearchDialog open={false} reduced={false} onOpenChange={vi.fn()}>
      {content}
    </SearchDialog>,
  );
  expect(clock.cancel).toHaveBeenCalledWith(id);
  expect(clock.pending.size).toBe(0);
  act(() => callback(performance.now()));
  expect(entrance.start).not.toHaveBeenCalled();
  expect(entrance.stop).not.toHaveBeenCalled();
  expect(document.querySelector("[data-magic-search]")).toHaveAttribute("inert");
  view.unmount();
  expect(entrance.stop).toHaveBeenCalledOnce();
});

test.each([false, true])(
  "preserves callback refs and their React cleanup (cleanup=%s)",
  (withCleanup) => {
    const d = setup(),
      release = vi.fn();
    const ref = vi.fn((_node: HTMLDivElement | null) => (withCleanup ? release : undefined));
    const view = d.mount(
      <SearchDialog ref={ref} open reduced onOpenChange={vi.fn()}>
        <DialogTitle>Referenced search</DialogTitle>
        <DialogDescription>Commands</DialogDescription>
      </SearchDialog>,
    );
    expect(ref).toHaveBeenCalledWith(screen.getByRole("dialog"));
    view.unmount();
    if (withCleanup) expect(release).toHaveBeenCalledOnce();
    else expect(ref).toHaveBeenLastCalledWith(null);
  },
);
