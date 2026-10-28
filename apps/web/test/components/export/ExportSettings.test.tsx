import { afterEach, expect, test, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { setup } from "../../support/ui";
import { ExportSettings } from "../../../src/components/export/ExportSettings";
import "../../../src/components/export/messages";
import { ExportScopeError } from "../../../src/services/session/export-scope";
afterEach(() => vi.unstubAllGlobals());
test("exports cropped selected content by default and switches explicitly to the complete artboard", async () => {
  const data = setup(),
    change = vi.fn();
  data.mount(
    <ExportSettings
      page={data.page}
      pageCount={1}
      selection={[data.rectangle.id]}
      services={data.services}
      onOpenChange={change}
      onTask={data.onTask}
      pendingRef={{ current: false }}
    />,
  );
  expect(screen.getByText("200 × 100")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Exporter l’image" }));
  await waitFor(() =>
    expect(data.services.exportImage).toHaveBeenCalledWith(
      expect.objectContaining({ selectionOnly: true }),
      { page: data.page, revision: 0, selection: [data.rectangle.id] },
    ),
  );
  fireEvent.click(screen.getByRole("switch", { name: "Plan de travail entier" }));
  expect(screen.getByText("1080 × 1080")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Exporter l’image" }));
  await waitFor(() =>
    expect(data.services.exportImage).toHaveBeenLastCalledWith(
      {
        scale: 1,
        format: "png",
        quality: 1,
        allPages: false,
      },
      { page: data.page, revision: 0, selection: [data.rectangle.id] },
    ),
  );
});
test("releases the pending gate and reports a rejecting task runner without simulating success", async () => {
  const data = setup(),
    pending = { current: false },
    change = vi.fn();
  data.mount(
    <ExportSettings
      page={data.page}
      pageCount={1}
      services={data.services}
      onOpenChange={change}
      onTask={vi.fn().mockRejectedValue(new Error("Task failed"))}
      pendingRef={pending}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Exporter l’image" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("L’export a échoué"));
  expect(pending.current).toBe(false);
  expect(change).not.toHaveBeenCalled();
});

test("uses the selected scope aspect before a blob and preserves expanded state while its resolution changes", async () => {
  vi.stubGlobal("devicePixelRatio", 1);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.classList.contains("export-preview") ? 300 : 0;
  });
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.classList.contains("export-preview") ? 200 : 0;
  });
  const BaseURL = URL;
  let sequence = 0;
  vi.stubGlobal(
    "URL",
    class extends BaseURL {
      static createObjectURL() {
        return `blob:preview-${++sequence}`;
      }
      static revokeObjectURL = vi.fn();
    },
  );
  const data = setup(),
    method = vi.fn().mockResolvedValue({
      blob: new Blob(["encoded"], { type: "image/webp" }),
      width: 128,
      height: 128,
    });
  data.services.previewExport = method;
  const view = data.mount(
    <ExportSettings
      page={data.page}
      pageCount={1}
      selection={[data.rectangle.id]}
      services={data.services}
      onTask={data.onTask}
      onOpenChange={vi.fn()}
      pendingRef={{ current: false }}
    />,
  );
  const body = document.querySelector(".export-preview-body");
  await waitFor(() =>
    expect(screen.getByRole("img")).toHaveStyle({ width: "300px", height: "150px" }),
  );
  expect(method).toHaveBeenCalledTimes(1);
  expect(method).toHaveBeenLastCalledWith(
    { selection: [data.rectangle.id], edge: 300, priority: "foreground" },
    expect.any(AbortSignal),
  );
  fireEvent.click(screen.getByRole("button", { name: "Agrandir l’aperçu" }));
  await waitFor(() =>
    expect(screen.getByRole("img")).toHaveStyle({ width: "600px", height: "300px" }),
  );
  expect(method).toHaveBeenCalledTimes(2);
  expect(method).toHaveBeenLastCalledWith(
    { selection: [data.rectangle.id], edge: 600, priority: "foreground" },
    expect.any(AbortSignal),
  );
  expect(document.querySelector(".export-preview-body")).toBe(body);
  expect(body).toHaveAttribute("data-expanded", "true");
  view.unmount();
});

test("translates a stale queued request and keeps the export open", async () => {
  const data = setup(),
    change = vi.fn(),
    errors: Error[] = [];
  vi.mocked(data.services.exportImage).mockRejectedValue(new ExportScopeError());
  data.mount(
    <ExportSettings
      page={data.page}
      pageCount={1}
      services={data.services}
      onOpenChange={change}
      pendingRef={{ current: false }}
      onTask={async (action) => {
        try {
          await action();
          return true;
        } catch (error) {
          errors.push(error as Error);
          return false;
        }
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Exporter l’image" }));
  await waitFor(() => expect(errors).toHaveLength(1));
  expect(errors[0]!.message).toBe(
    "La cible de l’export a changé. Ouvrez à nouveau le panneau d’export.",
  );
  expect(change).not.toHaveBeenCalled();
});
