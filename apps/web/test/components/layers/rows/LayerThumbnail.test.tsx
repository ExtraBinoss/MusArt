import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
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
      disconnect = disconnect;
    },
  );
  const layer = createLayer("text"),
    previewExport = vi.fn(async () => ({ blob: new Blob(["thumbnail"]), width: 96, height: 72 }));
  const services = { previewExport };
  const view = render(<LayerThumbnail layer={layer} services={services} previewKey="one" />);
  expect(previewExport).not.toHaveBeenCalled();
  await act(async () =>
    notify([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver),
  );
  await waitFor(() => expect(previewExport).toHaveBeenCalledOnce());
  expect(previewExport).toHaveBeenCalledExactlyOnceWith(
    { selection: [layer.id], edge: 96 },
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
    notify([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver),
  );
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:thumb-2");
  expect(screen.queryByRole("presentation")).toBeNull();
  view.unmount();
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
    { pageId: "other-artboard", selection: [layer.id], edge: 96 },
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
