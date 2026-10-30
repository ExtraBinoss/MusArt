import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { applyTheme, disposeThemeTransition } from "../../../src/state/session/theme";

beforeEach(() => {
  disposeThemeTransition();
  document.documentElement.classList.remove("dark");
});
afterEach(() => {
  disposeThemeTransition();
  vi.restoreAllMocks();
  delete (document as Partial<Document>).startViewTransition;
});

function nativeTransition() {
  const updates: (() => void | Promise<void>)[] = [];
  const finishers: (() => void)[] = [];
  const transitions: { skipTransition: ReturnType<typeof vi.fn> }[] = [];
  const start = vi.fn((update: () => void | Promise<void>) => {
    updates.push(update);
    const value = {
      skipTransition: vi.fn(),
      finished: new Promise<void>((resolve) => finishers.push(resolve)),
    };
    transitions.push(value);
    return value;
  });
  Object.defineProperty(document, "startViewTransition", { configurable: true, value: start });
  return { start, updates, finishers, transitions };
}

test("initial application stays immediate and a later switch blends once despite duplicate callers", async () => {
  const d = nativeTransition();
  applyTheme("light");
  expect(d.start).not.toHaveBeenCalled();
  applyTheme("dark");
  applyTheme("dark");
  expect(d.start).toHaveBeenCalledOnce();
  expect(document.documentElement).not.toHaveClass("dark");
  await d.updates[0]!();
  expect(document.documentElement).toHaveClass("dark");
  expect(document.documentElement.style.colorScheme).toBe("dark");
  expect(localStorage.getItem("musart.theme")).toBe("dark");
  d.finishers[0]!();
});

test("a newer choice supersedes a pending snapshot instead of restoring an obsolete theme", async () => {
  const d = nativeTransition();
  applyTheme("light");
  applyTheme("dark");
  applyTheme("light");
  expect(d.transitions[0]!.skipTransition).toHaveBeenCalledOnce();
  await d.updates[0]!();
  expect(document.documentElement).not.toHaveClass("dark");
  expect(localStorage.getItem("musart.theme")).toBe("light");
});

test("reduced motion resolves System immediately and native snapshot failures do not block switching", () => {
  const d = nativeTransition();
  applyTheme("light");
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    media: query,
    matches: true,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  }));
  applyTheme("system");
  expect(document.documentElement).toHaveClass("dark");
  expect(localStorage.getItem("musart.theme")).toBe("system");
  expect(d.start).not.toHaveBeenCalled();
  vi.mocked(window.matchMedia).mockRestore();
  d.start.mockImplementation(() => {
    throw new Error("Snapshot unavailable");
  });
  applyTheme("light");
  expect(document.documentElement).not.toHaveClass("dark");
});

test("disposal retires the native animation and pending deliveries cannot overwrite the final choice", async () => {
  const d = nativeTransition();
  applyTheme("light");
  applyTheme("dark");
  disposeThemeTransition();
  expect(document.documentElement).toHaveClass("dark");
  expect(d.transitions[0]!.skipTransition).toHaveBeenCalledOnce();
  applyTheme("light");
  await d.updates[0]!();
  expect(document.documentElement).not.toHaveClass("dark");
});
