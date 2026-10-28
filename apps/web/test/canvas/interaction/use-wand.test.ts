import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore } from "jotai";
import { expect, it, vi } from "vitest";
import { useWand } from "../../../src/canvas/interaction/use-wand";
import { selectionContiguousAtom, toleranceAtom } from "../../../src/state/session/editor";
import type {
  PixelSelectionPort,
  PixelSelectionState,
} from "../../../src/services/selection/wand/model";
function fixture() {
  let state: PixelSelectionState | null = null;
  const port: PixelSelectionPort = {
    read: () => state,
    subscribe: () => () => {},
    begin: vi.fn(async (_id, _x, _y, tolerance) => {
      state = {
        layerId: "image",
        width: 1,
        height: 1,
        tolerance,
        mode: "new",
        contiguous: true,
        path: "M0 0H1",
        selected: 1,
        simplified: false,
        busy: false,
        dragging: true,
      };
    }),
    update: vi.fn(async (tolerance) => {
      if (state) state = { ...state, tolerance };
    }),
    accept: vi.fn(async () => {
      if (state) state = { ...state, dragging: false };
    }),
    cancel: vi.fn(),
    invert: vi.fn(async () => {}),
    createMask: vi.fn(async () => {}),
    erase: vi.fn(async () => {}),
    deselect: vi.fn(),
    dispose: vi.fn(),
  };
  const store = createStore(),
    onError = vi.fn(),
    result = renderHook(() => useWand({ port, store, tool: "wand", onError }));
  return { port, store, onError, ...result };
}
it("applies modifier conventions, adjusts tolerance from horizontal motion and accepts without a mask command", async () => {
  const d = fixture();
  d.store.set(selectionContiguousAtom, false);
  act(() => {
    d.result.current.begin({ clientX: 10, shiftKey: true, altKey: false }, "image", 4, 5);
  });
  expect(d.port.begin).toHaveBeenCalledWith("image", 4, 5, 32, "add", false);
  act(() => {
    d.result.current.move({ clientX: 70 });
    d.result.current.finish();
  });
  await waitFor(() => expect(d.port.accept).toHaveBeenCalledOnce());
  await waitFor(() => expect(d.store.get(toleranceAtom)).toBe(62));
  expect(d.store.get(toleranceAtom)).toBe(62);
  expect(d.port.update).toHaveBeenLastCalledWith(62);
  expect(d.port.createMask).not.toHaveBeenCalled();
  expect(d.result.current.active()).toBe(false);
  act(() => {
    d.result.current.begin({ clientX: 0, shiftKey: false, altKey: true }, "image", 0, 0);
  });
  expect(d.port.begin).toHaveBeenLastCalledWith("image", 0, 0, 62, "subtract", false);
  d.unmount();
  expect(d.port.cancel).toHaveBeenCalled();
});
it("cancels a cold pending release without later accepting a stale gesture", async () => {
  const d = fixture();
  let release!: () => void;
  vi.mocked(d.port.begin).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  act(() => {
    d.result.current.begin({ clientX: 0, shiftKey: false, altKey: false }, "image", 0, 0);
    d.result.current.move({ clientX: 1000 });
    d.result.current.finish();
    d.result.current.escape();
  });
  await act(async () => {
    release();
    await Promise.resolve();
  });
  expect(d.port.cancel).toHaveBeenCalledOnce();
  expect(d.port.accept).not.toHaveBeenCalled();
  expect(d.store.get(toleranceAtom)).toBe(32);
  act(() => d.result.current.escape());
  expect(d.port.deselect).toHaveBeenCalledOnce();
});
it("reports a worker failure once and ignores stale cancellation errors", async () => {
  const d = fixture();
  vi.mocked(d.port.begin).mockRejectedValueOnce(Error("worker crashed"));
  act(() => {
    d.result.current.begin({ clientX: 0, shiftKey: false, altKey: false }, "image", 0, 0);
    d.result.current.finish();
  });
  await waitFor(() => expect(d.onError).toHaveBeenCalledExactlyOnceWith("worker crashed"));
  expect(d.port.deselect).toHaveBeenCalledOnce();
  vi.mocked(d.port.begin).mockRejectedValueOnce(new DOMException("cancelled", "AbortError"));
  act(() => {
    d.result.current.begin({ clientX: 0, shiftKey: false, altKey: false }, "image", 0, 0);
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(d.onError).toHaveBeenCalledOnce();
  expect(d.result.current.active()).toBe(false);
});
