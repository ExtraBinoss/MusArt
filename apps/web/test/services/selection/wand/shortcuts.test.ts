import { expect, it, vi } from "vitest";
import { pixelSelectionShortcut } from "../../../../src/services/selection/wand/shortcuts";
import type {
  PixelSelectionPort,
  PixelSelectionState,
} from "../../../../src/services/selection/wand/model";
function fixture() {
  let state: PixelSelectionState | null = {
    layerId: "image",
    width: 3,
    height: 1,
    path: "M0 0H1",
    selected: 1,
    simplified: false,
    tolerance: 32,
    mode: "new",
    contiguous: true,
    busy: false,
    dragging: false,
  };
  const port: PixelSelectionPort = {
      read: () => state,
      subscribe: () => () => {},
      begin: vi.fn(async () => {}),
      update: vi.fn(async () => {}),
      accept: vi.fn(async () => {}),
      cancel: vi.fn(),
      invert: vi.fn(async () => {}),
      createMask: vi.fn(async () => {}),
      erase: vi.fn(async () => {}),
      deselect: vi.fn(() => {
        state = null;
      }),
      dispose: vi.fn(),
    },
    onTask = vi.fn(async (action: () => void | Promise<void>) => {
      await action();
      return true;
    });
  return {
    port,
    onTask,
    publish: (value: typeof state) => {
      state = value;
    },
  };
}
it("gives pixel CtrlD and Delete priority while suppressing repeated or busy layer actions", async () => {
  const d = fixture(),
    erase = new KeyboardEvent("keydown", { key: "Delete", cancelable: true });
  expect(pixelSelectionShortcut(erase, d.port, d.onTask, "action:delete")).toBe(true);
  expect(erase.defaultPrevented).toBe(true);
  expect(d.port.erase).toHaveBeenCalledOnce();
  const repeated = new KeyboardEvent("keydown", {
    key: "Backspace",
    repeat: true,
    cancelable: true,
  });
  expect(pixelSelectionShortcut(repeated, d.port, d.onTask)).toBe(true);
  expect(d.port.erase).toHaveBeenCalledOnce();
  d.publish({ ...d.port.read()!, busy: true });
  expect(pixelSelectionShortcut(erase, d.port, d.onTask)).toBe(true);
  expect(d.port.erase).toHaveBeenCalledOnce();
  expect(
    pixelSelectionShortcut(
      new KeyboardEvent("keydown", { key: "x" }),
      d.port,
      d.onTask,
      "action:duplicate",
    ),
  ).toBe(true);
  expect(
    pixelSelectionShortcut(
      new KeyboardEvent("keydown", { key: "d", ctrlKey: true }),
      d.port,
      d.onTask,
    ),
  ).toBe(true);
  expect(d.port.deselect).toHaveBeenCalledOnce();
  expect(pixelSelectionShortcut(erase, d.port, d.onTask)).toBe(false);
  await Promise.resolve();
});
it("preserves input/modal editing and rejects a queued erase after its pixel region changes", async () => {
  const d = fixture(),
    input = document.createElement("input"),
    event = new KeyboardEvent("keydown", { key: "Delete" });
  input.dispatchEvent(event);
  expect(pixelSelectionShortcut(event, d.port, d.onTask)).toBe(false);
  expect(pixelSelectionShortcut(new KeyboardEvent("keydown", { key: "a" }), d.port, d.onTask)).toBe(
    false,
  );
  let pending!: () => void | Promise<void>;
  d.onTask.mockImplementationOnce(async (action) => {
    pending = action;
    return true;
  });
  pixelSelectionShortcut(new KeyboardEvent("keydown", { key: "Delete" }), d.port, d.onTask);
  d.publish(null);
  await expect(pending()).rejects.toMatchObject({ name: "AbortError" });
  expect(d.port.erase).not.toHaveBeenCalled();
});
