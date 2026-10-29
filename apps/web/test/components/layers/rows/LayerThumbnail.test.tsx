import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createLayer } from "@musart/core";
import type { EditorServices } from "../../../../src/state/contracts";
import { LayerThumbnail } from "../../../../src/components/layers/rows/LayerThumbnail";
import { StrictMode } from "react";
beforeEach(() => {
  let next = 0;
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => `blob:thumb-${++next}`);
      static revokeObjectURL = vi.fn();
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
test("a recycled visible node requires a fresh visibility sample for its new owner", async () => {
  let notify!: IntersectionObserverCallback;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        notify = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const first = createLayer("rectangle"),
    second = createLayer("text"),
    previewExport = vi.fn(
      async (..._args: Parameters<NonNullable<EditorServices["previewExport"]>>) => ({
        blob: new Blob(["preview"]),
        width: 96,
        height: 96,
      }),
    );
  const view = render(
    <LayerThumbnail layer={first} services={{ previewExport }} previewKey="first" />,
  );
  const node = view.container.querySelector(".layer-thumbnail")!;
  const sample = () => [
    { target: node, time: performance.now(), isIntersecting: true } as IntersectionObserverEntry,
  ];
  await act(async () => notify(sample(), {} as IntersectionObserver));
  await screen.findByRole("presentation");
  const stale = notify;
  view.rerender(<LayerThumbnail layer={second} services={{ previewExport }} previewKey="second" />);
  await act(async () => stale(sample(), {} as IntersectionObserver));
  expect(previewExport).toHaveBeenCalledOnce();
  expect(screen.queryByRole("presentation")).toBeNull();
  await act(async () => notify(sample(), {} as IntersectionObserver));
  await screen.findByRole("presentation");
  expect(previewExport).toHaveBeenCalledTimes(2);
  expect(previewExport.mock.calls[1]![0].selection).toEqual([second.id]);
  view.unmount();
});
test("a reused paint key cannot donate pixels to another layer or preview service", async () => {
  const first = createLayer("rectangle"),
    second = createLayer("rectangle"),
    previewExport = vi.fn(async () => ({ blob: new Blob(["first"]), width: 96, height: 96 })),
    replacement = vi.fn(async () => ({ blob: new Blob(["replacement"]), width: 96, height: 96 }));
  const view = render(
    <LayerThumbnail layer={first} services={{ previewExport }} previewKey="same" />,
  );
  await screen.findByRole("presentation");
  view.rerender(<LayerThumbnail layer={second} services={{ previewExport }} previewKey="same" />);
  await waitFor(() =>
    expect(screen.getByRole("presentation")).toHaveAttribute("src", "blob:thumb-2"),
  );
  expect(previewExport.mock.calls).toHaveLength(2);
  expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:thumb-1");
  view.rerender(
    <LayerThumbnail layer={second} services={{ previewExport: replacement }} previewKey="same" />,
  );
  expect(screen.queryByRole("presentation")).toBeNull();
  await waitFor(() =>
    expect(screen.getByRole("presentation")).toHaveAttribute("src", "blob:thumb-3"),
  );
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:thumb-2");
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:thumb-3");
});
test("real load reveals a new blob once while cached revisits and ordinary renders stay opaque", async () => {
  const layer = createLayer("rectangle"),
    blob = new Blob(["cached preview"]),
    previewExport = vi.fn(async () => ({ blob, width: 96, height: 96 })),
    services = { previewExport };
  const view = render(<LayerThumbnail layer={layer} services={services} previewKey="one" />);
  const image = await screen.findByRole("presentation");
  expect(image).not.toHaveAttribute("data-thumbnail-reveal");
  fireEvent.load(image);
  expect(image).toHaveAttribute("data-thumbnail-reveal", "true");
  view.rerender(
    <LayerThumbnail layer={{ ...layer, name: "Renamed" }} services={services} previewKey="one" />,
  );
  expect(screen.getByRole("presentation")).toBe(image);
  expect(previewExport).toHaveBeenCalledOnce();
  view.rerender(<LayerThumbnail layer={layer} services={services} previewKey="two" />);
  await waitFor(() => expect(screen.getByRole("presentation")).not.toBe(image));
  const cached = screen.getByRole("presentation");
  fireEvent.load(cached);
  expect(cached).not.toHaveAttribute("data-thumbnail-reveal");
});
test("a disposed image's late load cannot mark a new blob as already revealed", async () => {
  const layer = createLayer("rectangle"),
    blob = new Blob(["late preview"]),
    services = { previewExport: vi.fn(async () => ({ blob, width: 96, height: 96 })) };
  const first = render(<LayerThumbnail layer={layer} services={services} previewKey="late" />);
  const stale = await screen.findByRole("presentation");
  first.unmount();
  fireEvent.load(stale);
  render(<LayerThumbnail layer={layer} services={services} previewKey="late" />);
  const current = await screen.findByRole("presentation");
  fireEvent.load(current);
  expect(current).toHaveAttribute("data-thumbnail-reveal", "true");
});
test("only visible rows request a final rendered thumbnail and revoke each owned URL on replacement/unmount", async () => {
  let notify!: IntersectionObserverCallback;
  const disconnect = vi.fn();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        notify = callback;
      }
      observe() {}
      unobserve() {}
      disconnect = disconnect;
    },
  );
  const layer = createLayer("text"),
    previewExport = vi.fn(async () => ({ blob: new Blob(["thumbnail"]), width: 96, height: 72 }));
  const services = { previewExport };
  const view = render(<LayerThumbnail layer={layer} services={services} previewKey="one" />);
  expect(previewExport).not.toHaveBeenCalled();
  await act(async () =>
    notify(
      [
        {
          target: view.container.querySelector(".layer-thumbnail")!,
          time: performance.now(),
          isIntersecting: true,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    ),
  );
  await waitFor(() => expect(previewExport).toHaveBeenCalledOnce());
  expect(previewExport).toHaveBeenCalledExactlyOnceWith(
    { selection: [layer.id], edge: 96, priority: "visible" },
    expect.any(AbortSignal),
  );
  expect(screen.getByRole("presentation")).toHaveAttribute("src", "blob:thumb-1");
  view.rerender(<LayerThumbnail layer={layer} services={services} previewKey="two" />);
  await act(async () => {
    await Promise.resolve();
  });
  await waitFor(() =>
    expect(screen.getByRole("presentation")).toHaveAttribute("src", "blob:thumb-2"),
  );
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:thumb-1");
  await act(async () =>
    notify(
      [
        {
          target: view.container.querySelector(".layer-thumbnail")!,
          time: performance.now(),
          isIntersecting: false,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    ),
  );
  expect(URL.revokeObjectURL).not.toHaveBeenCalledWith("blob:thumb-2");
  const retained = screen.getByRole("presentation");
  await act(async () =>
    notify(
      [
        {
          target: view.container.querySelector(".layer-thumbnail")!,
          time: performance.now(),
          isIntersecting: true,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    ),
  );
  expect(screen.getByRole("presentation")).toBe(retained);
  expect(previewExport).toHaveBeenCalledTimes(2);
  expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:thumb-2");
  expect(disconnect).toHaveBeenCalledOnce();
});
test("aborts late requests and never allocates URLs for disposed rows or simulates a failed preview", async () => {
  const layer = createLayer("rectangle");
  let done!: (value: { blob: Blob; width: number; height: number }) => void;
  const previewExport = vi.fn(
    (..._args: Parameters<NonNullable<EditorServices["previewExport"]>>) =>
      new Promise<{ blob: Blob; width: number; height: number }>((resolve) => {
        done = resolve;
      }),
  );
  const view = render(
    <LayerThumbnail layer={layer} services={{ previewExport }} previewKey="one" />,
  );
  await waitFor(() => expect(previewExport).toHaveBeenCalledOnce());
  const signal = previewExport.mock.calls[0]![1];
  view.unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => done({ blob: new Blob(["late"]), width: 96, height: 96 }));
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  render(
    <LayerThumbnail
      layer={layer}
      services={{
        previewExport: vi.fn(async () => {
          throw Error("Render failed");
        }),
      }}
      previewKey="two"
    />,
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(screen.queryByRole("presentation")).toBeNull();
});
test("legacy adapters can show original images while vector/text layers retain honest kind icons", () => {
  const image = createLayer("image");
  render(
    <LayerThumbnail
      layer={image}
      previewKey="original"
      asset={{
        id: "a",
        name: "Original",
        width: 2,
        height: 2,
        mime: "image/png",
        dataUrl: "data:image/png;base64,AAAA",
      }}
    />,
  );
  expect(screen.getByRole("presentation")).toHaveAttribute("src", "data:image/png;base64,AAAA");
});
test("requests an inactive artboard preview explicitly without changing the active page", async () => {
  const layer = createLayer("text"),
    previewExport = vi.fn(async () => ({ blob: new Blob(["thumbnail"]), width: 96, height: 96 }));
  render(
    <LayerThumbnail
      layer={layer}
      pageId="other-artboard"
      services={{ previewExport }}
      previewKey="other"
    />,
  );
  await waitFor(() => expect(previewExport).toHaveBeenCalledOnce());
  expect(previewExport).toHaveBeenCalledWith(
    { pageId: "other-artboard", selection: [layer.id], edge: 96, priority: "visible" },
    expect.any(AbortSignal),
  );
});
test("StrictMode cancels its replayed idle job and unchanged visual keys retain the live URL", async () => {
  const layer = createLayer("rectangle"),
    previewExport = vi.fn(async () => ({ blob: new Blob(["thumb"]), width: 96, height: 96 }));
  const view = render(
    <StrictMode>
      <LayerThumbnail layer={layer} services={{ previewExport }} previewKey="same" />
    </StrictMode>,
  );
  await waitFor(() =>
    expect(screen.getByRole("presentation")).toHaveAttribute("src", "blob:thumb-1"),
  );
  expect(previewExport).toHaveBeenCalledOnce();
  view.rerender(
    <StrictMode>
      <LayerThumbnail
        layer={{ ...layer, name: "Renamed" }}
        services={{ previewExport }}
        previewKey="same"
      />
    </StrictMode>,
  );
  await act(() => new Promise((resolve) => setTimeout(resolve, 25)));
  expect(previewExport).toHaveBeenCalledOnce();
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:thumb-1");
});

test("requests genuine page-scoped effect/mask variants and rejects a late foreign-page thumbnail", async () => {
  const layer = createLayer("image", { id: "owner" });
  const pending: ((value: { blob: Blob; width: number; height: number }) => void)[] = [];
  const previewExport = vi.fn(
    (..._args: Parameters<NonNullable<EditorServices["previewExport"]>>) =>
      new Promise<{ blob: Blob; width: number; height: number }>((resolve) =>
        pending.push(resolve),
      ),
  );
  const view = render(
    <LayerThumbnail
      layer={layer}
      pageId="second"
      services={{ previewExport }}
      previewKey="same"
      variant={{ kind: "effect", effectId: "dither" }}
    />,
  );
  await waitFor(() => expect(previewExport).toHaveBeenCalledOnce());
  expect(previewExport.mock.calls[0]![0]).toEqual({
    selection: [layer.id],
    pageId: "second",
    edge: 96,
    priority: "visible",
    variant: { kind: "effect", effectId: "dither" },
  });
  const signal = previewExport.mock.calls[0]![1];
  view.rerender(
    <LayerThumbnail
      layer={layer}
      pageId="third"
      services={{ previewExport }}
      previewKey="same"
      variant={{ kind: "mask" }}
    />,
  );
  expect(signal?.aborted).toBe(true);
  await act(async () => pending[0]!({ blob: new Blob(["stale"]), width: 96, height: 96 }));
  await waitFor(() => expect(previewExport).toHaveBeenCalledTimes(2));
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(previewExport.mock.calls[1]![0]).toEqual({
    selection: [layer.id],
    pageId: "third",
    edge: 96,
    priority: "visible",
    variant: { kind: "mask" },
  });
  await act(async () => pending[1]!({ blob: new Blob(["current"]), width: 96, height: 96 }));
  expect(screen.getByRole("presentation")).toHaveAttribute("src", "blob:thumb-1");
  expect(view.container.querySelector("[data-thumbnail-variant]")).toHaveAttribute(
    "data-thumbnail-variant",
    "mask",
  );
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:thumb-1");
});
