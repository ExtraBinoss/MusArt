import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { ExportPreviewFrame } from "../../../src/components/export/ExportPreviewFrame";
import { setup } from "../../support/ui";
import "../../../src/components/export/messages";
let viewportWidth = 300,
  viewportHeight = 200;
const observers = new Set<() => void>(),
  callbacks: (() => void)[] = [];
beforeEach(() => {
  viewportWidth = 300;
  viewportHeight = 200;
  observers.clear();
  callbacks.length = 0;
  vi.stubGlobal("devicePixelRatio", 1);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.classList.contains("export-preview") ? viewportWidth : 0;
  });
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.classList.contains("export-preview") ? viewportHeight : 0;
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private readonly callback: () => void) {
        callbacks.push(callback);
      }
      observe() {
        observers.add(this.callback);
      }
      disconnect() {
        observers.delete(this.callback);
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
function resize() {
  act(() => {
    for (const callback of observers) callback();
  });
}
test("fits all source pixels inside real padded bounds, then doubles that fit with a new resolution", () => {
  const resolution = vi.fn();
  const view = setup().mount(
    <ExportPreviewFrame
      url="blob:real-preview"
      loading={false}
      width={320}
      height={180}
      format="jpeg"
      onResolution={resolution}
    />,
  );
  const image = screen.getByRole("img", { name: "Aperçu de l’export" }),
    body = document.querySelector<HTMLElement>(".export-preview-body")!;
  body.style.padding = "14px";
  resize();
  expect(image).toHaveAttribute("data-format", "jpeg");
  expect(image).toHaveStyle({ width: "272px", height: "153px" });
  expect(body).toHaveStyle({ width: "300px", height: "200px" });
  expect(resolution).toHaveBeenLastCalledWith(272);
  fireEvent.click(screen.getByRole("button", { name: "Agrandir l’aperçu" }));
  expect(body).toHaveAttribute("data-expanded", "true");
  expect(image).toHaveStyle({ width: "544px", height: "306px" });
  expect(body).toHaveStyle({ width: "572px", height: "334px" });
  expect(resolution).toHaveBeenLastCalledWith(544);
  view.rerender(
    <ExportPreviewFrame
      url="blob:larger-preview"
      loading={false}
      width={320}
      height={180}
      format="jpeg"
      onResolution={resolution}
    />,
  );
  expect(document.querySelector(".export-preview-body")).toBe(body);
  expect(body).toHaveAttribute("data-expanded", "true");
  fireEvent.click(screen.getByRole("button", { name: "Ajuster l’aperçu" }));
  expect(image).toHaveStyle({ width: "272px", height: "153px" });
  expect(resolution).toHaveBeenLastCalledWith(272);
  view.unmount();
  expect(observers.size).toBe(0);
});
test("uses source dimensions before the blob, observes viewport and DPR changes, and rejects stale measurements", () => {
  const resolution = vi.fn(),
    data = setup();
  const view = data.mount(
    <ExportPreviewFrame
      url={null}
      loading
      width={778}
      height={778}
      format="png"
      onResolution={resolution}
    />,
  );
  const body = document.querySelector<HTMLElement>(".export-preview-body")!;
  body.style.padding = "14px";
  resize();
  expect(resolution).toHaveBeenLastCalledWith(172);
  expect(body).toHaveStyle({ width: "300px", height: "200px" });
  vi.stubGlobal("devicePixelRatio", 2);
  fireEvent(window, new Event("resize"));
  expect(resolution).toHaveBeenLastCalledWith(344);
  viewportHeight = 160;
  resize();
  expect(resolution).toHaveBeenLastCalledWith(264);
  const old = [...callbacks];
  view.unmount();
  resolution.mockClear();
  act(() => {
    for (const callback of old) callback();
  });
  fireEvent(window, new Event("resize"));
  expect(resolution).not.toHaveBeenCalled();
});
test("bounds encoded resolution and tiny-source enlargement while ignoring a zero-size viewport", () => {
  const resolution = vi.fn(),
    data = setup();
  const view = data.mount(
    <ExportPreviewFrame
      url="blob:preview"
      loading={false}
      width={1}
      height={1}
      format="png"
      onResolution={resolution}
    />,
  );
  expect(screen.getByRole("img")).toHaveStyle({ width: "4px", height: "4px" });
  expect(resolution).toHaveBeenLastCalledWith(16);
  fireEvent.click(screen.getByRole("button", { name: "Agrandir l’aperçu" }));
  expect(screen.getByRole("img")).toHaveStyle({ width: "8px", height: "8px" });
  view.rerender(
    <ExportPreviewFrame
      url="blob:preview"
      loading={false}
      width={778}
      height={778}
      format="png"
      onResolution={resolution}
    />,
  );
  vi.stubGlobal("devicePixelRatio", 4);
  resize();
  expect(resolution).toHaveBeenLastCalledWith(768);
  resolution.mockClear();
  viewportWidth = viewportHeight = 0;
  resize();
  expect(resolution).not.toHaveBeenCalled();
});
test("reports pending and unavailable real renders without a fabricated image", () => {
  const data = setup();
  const view = data.mount(
    <ExportPreviewFrame url={null} loading width={0} height={0} format="png" />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Préparation de l’aperçu");
  expect(screen.queryByRole("img")).toBeNull();
  view.rerender(
    <ExportPreviewFrame url={null} loading={false} width={0} height={0} format="webp" />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Aperçu indisponible");
  expect(screen.queryByRole("button")).toBeNull();
});

test("caps a panoramic DPR3 preview's physical display and encoding together when enlarged", () => {
  // A binary-exact fit isolates the physical cap from conservative floor roundoff.
  viewportWidth = 228;
  vi.stubGlobal("devicePixelRatio", 3);
  const resolution = vi.fn();
  setup().mount(
    <ExportPreviewFrame
      url="blob:panorama"
      loading={false}
      width={1600}
      height={400}
      format="png"
      onResolution={resolution}
    />,
  );
  const image = screen.getByRole("img"),
    body = document.querySelector<HTMLElement>(".export-preview-body")!;
  body.style.padding = "14px";
  resize();
  expect(image).toHaveStyle({ width: "200px", height: "50px" });
  expect(resolution).toHaveBeenLastCalledWith(600);
  fireEvent.click(screen.getByRole("button", { name: "Agrandir l’aperçu" }));
  expect(image).toHaveStyle({ width: "256px", height: "64px" });
  expect(resolution).toHaveBeenLastCalledWith(768);
  expect(body).toHaveStyle({ width: "284px", height: "200px" });
});
