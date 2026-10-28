import { createRef } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ProjectThumbnailLease } from "../../../src/state/contracts";
import { useArtboardPreviews } from "../../../src/canvas/artboards/use-previews";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function fixture() {
  const root = createRef<HTMLDivElement>();
  root.current = document.createElement("div");
  root.current.innerHTML =
    '<div class="canvas-artboard-backdrop" data-artboard-id="a"></div><div class="canvas-artboard-backdrop" data-artboard-id="b"></div>';
  let notify: (id: string) => void = () => {};
  const stop = vi.fn(),
    services = {
      loadProjectThumbnails:
        vi.fn<(projectId: string, ids?: readonly string[]) => Promise<ProjectThumbnailLease>>(),
      subscribeProjectThumbnails: vi.fn((listener: (id: string) => void) => {
        notify = listener;
        return stop;
      }),
    };
  const lease = (url = "blob:a"): ProjectThumbnailLease => ({
    items: [{ pageId: "a", revision: url, width: 100, height: 80, url }],
    release: vi.fn(),
  });
  return { root, services, stop, notify: (id: string) => notify(id), lease };
}

it("leases only visible boards in one batch, coalesces invalidations and releases after replacement/unmount", async () => {
  const d = fixture();
  let callback: IntersectionObserverCallback;
  const observe = vi.fn(),
    disconnect = vi.fn();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(fn: IntersectionObserverCallback) {
        callback = fn;
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
  const first = d.lease(),
    second = d.lease("blob:new");
  d.services.loadProjectThumbnails.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  const { result, unmount } = renderHook(() =>
    useArtboardPreviews(d.root, "project", ["a", "b"], d.services),
  );
  expect(observe).toHaveBeenCalledTimes(2);
  expect(d.services.loadProjectThumbnails).not.toHaveBeenCalled();
  const visible = (a: boolean, b: boolean) =>
    act(() =>
      callback!(
        [
          { target: d.root.current!.children[0], isIntersecting: a },
          { target: d.root.current!.children[1], isIntersecting: b },
        ] as unknown as IntersectionObserverEntry[],
        {} as IntersectionObserver,
      ),
    );
  visible(true, false);
  visible(true, false);
  await waitFor(() => expect(result.current.items).toBe(first.items));
  expect(d.services.loadProjectThumbnails).toHaveBeenCalledExactlyOnceWith("project", ["a"]);
  vi.useFakeTimers();
  act(() => {
    d.notify("other");
    d.notify("project");
    d.notify("project");
    vi.advanceTimersByTime(50);
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(d.services.loadProjectThumbnails).toHaveBeenCalledTimes(2);
  expect(result.current.items).toBe(second.items);
  expect(first.release).toHaveBeenCalledOnce();
  visible(false, false);
  expect(second.release).toHaveBeenCalledOnce();
  act(() => d.notify("project"));
  unmount();
  expect(vi.getTimerCount()).toBe(0);
  expect(d.stop).toHaveBeenCalledOnce();
  expect(disconnect).toHaveBeenCalledOnce();
});

it("rejects stale asynchronous leases, exposes real failures/retry and handles absent services/roots", async () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  const d = fixture();
  let finish!: (lease: ProjectThumbnailLease) => void;
  const stale = d.lease();
  d.services.loadProjectThumbnails
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockRejectedValueOnce(new Error("storage failed"))
    .mockResolvedValueOnce(d.lease("blob:retry"));
  const { result, rerender, unmount } = renderHook(
    ({ id }) => useArtboardPreviews(d.root, id, ["a"], d.services),
    { initialProps: { id: "old" } },
  );
  await waitFor(() => expect(d.services.loadProjectThumbnails).toHaveBeenCalledOnce());
  rerender({ id: "new" });
  await waitFor(() => expect(result.current.failed).toBe(true));
  await act(async () => {
    finish(stale);
    await Promise.resolve();
  });
  expect(stale.release).toHaveBeenCalledOnce();
  expect(result.current.items).toEqual([]);
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.items[0]?.url).toBe("blob:retry"));
  unmount();
  const absent = renderHook(() => useArtboardPreviews({ current: null }, "none", []));
  expect(absent.result.current.failed).toBe(true);
  absent.unmount();
});

it("releases a late lease after unmount and ignores late failure after disposal", async () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  const d = fixture(),
    late = d.lease();
  let resolve!: (value: ProjectThumbnailLease) => void, reject!: (reason: Error) => void;
  d.services.loadProjectThumbnails
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((_done, fail) => {
          reject = fail;
        }),
    );
  const first = renderHook(() => useArtboardPreviews(d.root, "p", ["a"], d.services));
  await waitFor(() => expect(d.services.loadProjectThumbnails).toHaveBeenCalledTimes(1));
  first.unmount();
  await act(async () => {
    resolve(late);
    await Promise.resolve();
  });
  expect(late.release).toHaveBeenCalledOnce();
  const second = renderHook(() => useArtboardPreviews(d.root, "p", ["a"], d.services));
  await waitFor(() => expect(d.services.loadProjectThumbnails).toHaveBeenCalledTimes(2));
  second.unmount();
  await act(async () => {
    reject(new Error("gone"));
    await Promise.resolve();
  });
});

it("retains available artwork while a changed visibility batch loads or fails, then releases only after replacement", async () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  const d = fixture(),
    first = d.lease(),
    next = d.lease("blob:replacement");
  let reject!: (error: Error) => void;
  d.services.loadProjectThumbnails
    .mockResolvedValueOnce(first)
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    )
    .mockResolvedValueOnce(next);
  const view = renderHook(({ ids }) => useArtboardPreviews(d.root, "project", ids, d.services), {
    initialProps: { ids: ["a"] },
  });
  try {
    await waitFor(() => expect(view.result.current.items).toBe(first.items));
    view.rerender({ ids: ["a", "b"] });
    expect(view.result.current.items).toBe(first.items);
    expect(first.release).not.toHaveBeenCalled();
    await act(async () => {
      reject(new Error("preview store unavailable"));
      await Promise.resolve();
    });
    expect(view.result.current.failed).toBe(true);
    expect(view.result.current.items).toBe(first.items);
    expect(first.release).not.toHaveBeenCalled();
    act(() => view.result.current.retry());
    await waitFor(() => expect(view.result.current.items).toBe(next.items));
    expect(view.result.current.failed).toBe(false);
    expect(first.release).toHaveBeenCalledOnce();
  } finally {
    view.unmount();
  }
  expect(next.release).toHaveBeenCalledOnce();
});
