import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import {
  EditorNotice,
  ERROR_NOTICE_MS,
  SUCCESS_NOTICE_MS,
} from "../../../src/components/notifications/EditorNotice";
import { setup } from "../../support/ui";

vi.mock("motion/react", async (original) => ({
  ...(await original<typeof import("motion/react")>()),
  useReducedMotion: () => true,
}));
afterEach(() => {
  vi.useRealTimers();
});
const advance = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};

test("expires success at four seconds and errors at eight; replacing a notice restarts its timer", async () => {
  vi.useFakeTimers();
  const d = setup(),
    close = vi.fn(),
    success = { message: "Saved", error: false };
  const view = d.mount(<EditorNotice notice={success} onClose={close} />);
  expect(screen.getByRole("status")).toHaveTextContent("Saved");
  await advance(SUCCESS_NOTICE_MS - 1);
  expect(close).not.toHaveBeenCalled();
  await advance(1);
  expect(close).toHaveBeenCalledOnce();
  close.mockClear();
  const error = { message: "Missing original", error: true };
  view.rerender(<EditorNotice notice={error} onClose={close} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Missing original");
  await advance(3000);
  view.rerender(<EditorNotice notice={{ message: "New failure", error: true }} onClose={close} />);
  await advance(ERROR_NOTICE_MS - 1);
  expect(close).not.toHaveBeenCalled();
  await advance(1);
  expect(close).toHaveBeenCalledOnce();
  view.unmount();
});
test("pauses while hovered or keyboard-focused and copies both friendly message and exact diagnostics", async () => {
  vi.useFakeTimers();
  const write = vi.fn(async (_text: string) => {});
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: write },
  });
  const d = setup(),
    close = vi.fn();
  const view = d.mount(
    <EditorNotice
      notice={{
        message: "Video unavailable",
        error: true,
        details: "VideoSourceError [decodeFailed]: packet 42",
      }}
      onClose={close}
    />,
  );
  const card = document.querySelector<HTMLElement>(".notice-card")!;
  await advance(1000);
  fireEvent.pointerOver(card);
  await advance(10000);
  expect(close).not.toHaveBeenCalled();
  const button = screen.getByRole("button", { name: "Copier le message et le diagnostic" });
  act(() => button.focus());
  fireEvent.pointerOut(card);
  await advance(10000);
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(button);
  await act(async () => {});
  expect(write).toHaveBeenCalledExactlyOnceWith(
    "Video unavailable\n\nDétails techniques:\nVideoSourceError [decodeFailed]: packet 42",
  );
  act(() => button.blur());
  await advance(6999);
  expect(close).not.toHaveBeenCalled();
  await advance(1);
  expect(close).toHaveBeenCalledOnce();
  view.unmount();
});
test("holds expiry during pending clipboard permission, closes explicitly and cleans timers/late work", async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  const write = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: write },
  });
  const d = setup(),
    close = vi.fn(),
    view = d.mount(<EditorNotice notice={{ message: "Ready", error: false }} onClose={close} />);
  fireEvent.click(screen.getByRole("button", { name: "Copier le message et le diagnostic" }));
  await advance(20000);
  expect(close).not.toHaveBeenCalled();
  await act(async () => finish());
  expect(write).toHaveBeenCalledExactlyOnceWith("Ready");
  fireEvent.click(screen.getByRole("button", { name: "Fermer la notification" }));
  expect(close).toHaveBeenCalledOnce();
  view.unmount();
  await advance(20000);
  expect(close).toHaveBeenCalledOnce();
});
test("duplicate notices and a changing onClose preserve expiry; null/unmount cancel it", async () => {
  vi.useFakeTimers();
  const d = setup(),
    first = vi.fn(),
    latest = vi.fn(),
    notice = { message: "Notice", error: false };
  const view = d.mount(<EditorNotice notice={notice} onClose={first} />);
  await advance(3000);
  view.rerender(<EditorNotice notice={{ ...notice }} onClose={latest} />);
  await advance(1000);
  expect(first).not.toHaveBeenCalled();
  expect(latest).toHaveBeenCalledOnce();
  view.rerender(<EditorNotice notice={{ ...notice }} onClose={latest} />);
  view.rerender(<EditorNotice notice={null} onClose={latest} />);
  await advance(10000);
  expect(latest).toHaveBeenCalledOnce();
  view.unmount();
});
