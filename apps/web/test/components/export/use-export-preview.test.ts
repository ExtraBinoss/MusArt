import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createPage } from "@musart/core";
import type { EditorServices, ExportPreview } from "../../../src/state/contracts";
import { useExportPreview } from "../../../src/components/export/use-export-preview";
const BaseURL = URL;
const create = vi.fn(() => "blob:preview"),
  revoke = vi.fn();
beforeEach(() => {
  create.mockClear();
  revoke.mockClear();
  vi.stubGlobal(
    "URL",
    class extends BaseURL {
      static createObjectURL = create;
      static revokeObjectURL = revoke;
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
const preview: ExportPreview = {
  blob: new Blob(["encoded"], { type: "image/webp" }),
  width: 100,
  height: 80,
};
function deferred() {
  let resolve!: (preview: ExportPreview) => void, reject!: (error: Error) => void;
  const promise = new Promise<ExportPreview>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
test("owns native preview URLs, scoped options and cancellation", async () => {
  const method = vi.fn<NonNullable<EditorServices["previewExport"]>>().mockResolvedValue(preview);
  const services = { previewExport: method },
    page = createPage();
  const view = renderHook(() => useExportPreview(page, ["a"], true, 0, services));
  expect(view.result.current.loading).toBe(true);
  await waitFor(() => expect(view.result.current.url).toBe("blob:preview"));
  view.rerender();
  await act(async () => {
    await Promise.resolve();
  });
  expect(method).toHaveBeenCalledTimes(1);
  expect(method).toHaveBeenCalledWith(
    { selection: ["a"], edge: 384, priority: "foreground" },
    expect.any(AbortSignal),
  );
  view.unmount();
  expect(method.mock.calls[0]![1]!.aborted).toBe(true);
  expect(revoke).toHaveBeenCalledWith("blob:preview");
});
test("ignores stale responses and releases URLs before a changed frame replaces them", async () => {
  const first = deferred(),
    second = deferred();
  const method = vi
    .fn<NonNullable<EditorServices["previewExport"]>>()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise)
    .mockRejectedValue(new Error("GPU unavailable"));
  const services = { previewExport: method },
    page = createPage();
  const ids = Object.freeze(["a"]);
  const view = renderHook(
    ({ revision }) => useExportPreview(page, ids, false, revision, services),
    { initialProps: { revision: 0 } },
  );
  await waitFor(() => expect(method).toHaveBeenCalledTimes(1));
  view.rerender({ revision: 1 });
  await act(async () => {
    first.resolve(preview);
    second.resolve(preview);
  });
  expect(create).toHaveBeenCalledTimes(1);
  expect(view.result.current.url).toBe("blob:preview");
  expect(method).toHaveBeenLastCalledWith(
    { all: true, edge: 384, priority: "foreground" },
    expect.any(AbortSignal),
  );
  view.rerender({ revision: 2 });
  expect(view.result.current.url).toBeNull();
  await waitFor(() => expect(view.result.current.failed).toBe(true));
  expect(revoke).toHaveBeenCalledTimes(1);
  view.unmount();
});
test("reports unsupported or failed URL preparation and does not dispatch an abandoned mount", async () => {
  const page = createPage(),
    ids = Object.freeze([] as string[]);
  const absent = renderHook(() => useExportPreview(page, ids, false, 0, {} as EditorServices));
  expect(absent.result.current).toMatchObject({ url: null, loading: false, failed: true });
  absent.unmount();
  const method = vi.fn<NonNullable<EditorServices["previewExport"]>>().mockResolvedValue(preview);
  create.mockImplementationOnce(() => {
    throw new Error("URL unavailable");
  });
  const services = { previewExport: method };
  const bad = renderHook(() => useExportPreview(page, ids, false, 0, services));
  await waitFor(() => expect(bad.result.current.failed).toBe(true));
  bad.unmount();
  method.mockClear();
  const gone = renderHook(() => useExportPreview(page, ids, false, 0, services));
  gone.unmount();
  await act(async () => {
    await Promise.resolve();
  });
  expect(method).not.toHaveBeenCalled();
});
