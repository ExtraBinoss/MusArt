import { afterEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import "../../../src/state/i18n";
import { SearchInput } from "../../../src/components/assets/SearchInput";
let reduced = false;
vi.mock("motion/react", () => ({ useReducedMotion: () => reduced }));
afterEach(() => {
  vi.useRealTimers();
  reduced = false;
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
});
test("animates local hints imperatively, pauses typed text, resumes visibility and cleans timers", async () => {
  vi.useFakeTimers();
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  const view = render(
    <SearchInput
      aria-label="Search"
      prefix="Find"
      hints={[
        { label: "ABC", preview: <b>A</b> },
        { label: "XYZ", preview: <b>X</b> },
      ]}
    />,
  );
  const input = screen.getByLabelText("Search");
  expect(input).toHaveAttribute("placeholder", "Find …");
  await act(async () => {
    vi.advanceTimersByTime(130);
  });
  expect(input).toHaveAttribute("placeholder", "Find AB…");
  fireEvent.change(input, { target: { value: "typed" } });
  const placeholder = input.getAttribute("placeholder");
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
  expect(input).toHaveAttribute("placeholder", placeholder);
  fireEvent.change(input, { target: { value: "" } });
  await act(async () => {
    vi.advanceTimersByTime(2400);
  });
  expect(input.getAttribute("placeholder")).toMatch(/^Find /);
  Object.defineProperty(document, "hidden", { configurable: true, value: true });
  fireEvent(document, new Event("visibilitychange"));
  const timers = vi.getTimerCount();
  expect(timers).toBe(0);
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  fireEvent(document, new Event("visibilitychange"));
  expect(vi.getTimerCount()).toBeGreaterThan(0);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
test("respects reduced motion and focuses the stable search field when category changes", async () => {
  reduced = true;
  const view = render(
    <SearchInput aria-label="Search" autoFocus focusKey="shapes" hints={[{ label: "Stars" }]} />,
  );
  expect(screen.getByLabelText("Search")).toHaveFocus();
  expect(screen.getByLabelText("Search")).toHaveAttribute("placeholder", "Rechercher Stars…");
  view.rerender(<SearchInput aria-label="Search" autoFocus focusKey="icons" hints={[]} />);
  expect(screen.getByLabelText("Search")).toHaveAttribute("placeholder", "Rechercher…");
});
test("captures plain typing from the active palette while preserving inputs and unrelated modals", async () => {
  const change = vi.fn();
  const view = render(
    <>
      <button>Canvas</button>
      <SearchInput aria-label="Search" captureTyping onChange={change} />
    </>,
  );
  fireEvent.keyDown(screen.getByText("Canvas"), { key: "a" });
  expect(screen.getByLabelText("Search")).toHaveValue("a");
  expect(change).toHaveBeenCalledOnce();
  for (const key of [
    { key: "b", ctrlKey: true },
    { key: "c", metaKey: true },
    { key: "d", altKey: true },
    { key: " " },
    { key: "ArrowRight" },
    { key: "e", isComposing: true },
  ])
    fireEvent.keyDown(screen.getByText("Canvas"), key);
  fireEvent.keyDown(screen.getByLabelText("Search"), { key: "x" });
  expect(screen.getByLabelText("Search")).toHaveValue("a");
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  dialog.innerHTML = "<button>Other modal</button>";
  document.body.append(dialog);
  fireEvent.keyDown(dialog.firstElementChild!, { key: "q" });
  fireEvent.keyDown(screen.getByText("Canvas"), { key: "z" });
  expect(screen.getByLabelText("Search")).toHaveValue("a");
  dialog.remove();
  view.unmount();
});

test("exposes an optional search button which focuses the real search field", () => {
  render(<SearchInput aria-label="Search fonts" searchButton />);
  fireEvent.click(screen.getByRole("button", { name: "Search fonts" }));
  expect(screen.getByRole("searchbox", { name: "Search fonts" })).toHaveFocus();
});

test("keeps separate preview slots when projects or templates have identical names", () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const view = render(
      <SearchInput
        aria-label="Search"
        hints={[
          { label: "Share Your Work", preview: <img alt="First project" src="/first.webp" /> },
          { label: "Share Your Work", preview: <img alt="Second project" src="/second.webp" /> },
        ]}
      />,
    );
    expect(screen.getByAltText("First project")).toHaveAttribute("src", "/first.webp");
    expect(screen.getByAltText("Second project")).toHaveAttribute("src", "/second.webp");
    expect(
      error.mock.calls.some((args) => args.some((value) => String(value).includes("same key"))),
    ).toBe(false);
    view.unmount();
  } finally {
    error.mockRestore();
  }
});
