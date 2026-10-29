import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { CopyButton, COPY_FEEDBACK_MS } from "../../../src/components/ui/copy-button";
import { setup } from "../../support/ui";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function clipboard(
  writeText: (text: string) => Promise<void> = vi.fn(async (_value: string) => {}),
) {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  return writeText;
}
test("waits for real clipboard success, prevents duplicate copies, animates feedback and resets after 1.5 seconds", async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  const write = clipboard(
    vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const pending = vi.fn();
  setup().mount(<CopyButton text="Diagnostic exact" onCopyingChange={pending} />);
  fireEvent.click(screen.getByRole("button", { name: "Copier" }));
  expect(screen.getByRole("button", { name: "Copie…" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Copie…" }));
  expect(write).toHaveBeenCalledExactlyOnceWith("Diagnostic exact");
  expect(screen.queryByRole("button", { name: "Copié" })).toBeNull();
  await act(async () => finish());
  expect(screen.getByRole("button", { name: "Copié" })).toHaveAttribute(
    "data-copy-state",
    "copied",
  );
  expect(pending.mock.calls).toEqual([[true], [false]]);
  await act(async () => {
    vi.advanceTimersByTime(COPY_FEEDBACK_MS - 1);
  });
  expect(screen.getByRole("button", { name: "Copié" })).toBeEnabled();
  await act(async () => {
    vi.advanceTimersByTime(1);
  });
  expect(screen.getByRole("button", { name: "Copier" })).toBeEnabled();
});
test("reports real clipboard denial/unavailability and can retry successfully", async () => {
  const write = clipboard(
    vi
      .fn()
      .mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"))
      .mockResolvedValue(undefined),
  );
  const failed = vi.fn();
  const view = setup().mount(<CopyButton text="message" onCopyError={failed} />);
  fireEvent.click(screen.getByRole("button", { name: "Copier" }));
  await screen.findByRole("alert");
  expect(screen.queryByRole("button", { name: "Copié" })).toBeNull();
  expect(failed).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: /La copie a échoué/ }));
  await screen.findByRole("button", { name: "Copié" });
  expect(write).toHaveBeenCalledTimes(2);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  view.rerender(<CopyButton text="new" onCopyError={failed} />);
  fireEvent.click(screen.getByRole("button", { name: "Copier" }));
  expect(screen.getByRole("alert")).toHaveTextContent("indisponible");
});
test("ignores late completion after content replacement/unmount and cleans the feedback timer", async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  clipboard(
    vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const pending = vi.fn(),
    d = setup(),
    view = d.mount(<CopyButton text="old" onCopyingChange={pending} />);
  fireEvent.click(screen.getByRole("button", { name: "Copier" }));
  view.rerender(<CopyButton text="new" onCopyingChange={pending} />);
  await act(async () => finish());
  expect(screen.getByRole("button", { name: "Copier" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Copié" })).toBeNull();
  clipboard();
  fireEvent.click(screen.getByRole("button", { name: "Copier" }));
  await act(async () => {});
  view.unmount();
  await act(async () => {
    vi.runOnlyPendingTimers();
  });
  expect(pending.mock.calls).toEqual([[true], [false], [true], [false]]);
});
