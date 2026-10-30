import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { useFontCanvasStatus } from "../../../../src/components/properties/fonts/canvas-status";
import { getFontPresentation } from "../../../../src/state/session/font-presentation";

test("keeps loading until the matching draw and cancels preview ownership without retiring a commit", () => {
  const layer = createLayer("text", { fontFamily: "Inter", fontWeight: 400 }),
    page = createPage({ layers: [layer] });
  const engine = new EditorEngine(createProject({ pages: [page] })),
    port = getFontPresentation(engine),
    renderer = port.acquire();
  const hook = renderHook(() => useFontCanvasStatus(engine));
  act(() =>
    hook.result.current.request(
      { layerId: layer.id, family: "Inter", weight: 400 },
      "Inter",
      "preview",
    ),
  );
  const ticket = port.read().ticket!;
  expect(hook.result.current.view?.status).toBe("pending");
  act(() => {
    renderer.capture(page, {
      projectId: engine.getSnapshot().project.id,
      revision: engine.getSnapshot().revision,
    });
    renderer.present(ticket);
  });
  expect(hook.result.current.view).toMatchObject({ status: "ready", label: "Inter" });
  act(() => hook.result.current.cancel(true));
  expect(hook.result.current.view).toBeUndefined();
  act(() =>
    hook.result.current.request(
      { layerId: layer.id, family: "Inter", weight: 400 },
      "Inter",
      "commit",
    ),
  );
  act(() => hook.result.current.cancel(true));
  expect(hook.result.current.view?.status).toBe("pending");
  hook.unmount();
  expect(port.read().status).toBe("idle");
  renderer.release();
});
test("isolated controls never invent a renderer-ready acknowledgment", () => {
  const hook = renderHook(() => useFontCanvasStatus());
  act(() =>
    hook.result.current.request(
      { layerId: "text", family: "Inter", weight: 400 },
      "Inter",
      "preview",
    ),
  );
  expect(hook.result.current.view).toBeUndefined();
});
test("callbacks retained across engine replacement or unmount cannot create new subscriptions/tickets", () => {
  const a = new EditorEngine(createProject()),
    b = new EditorEngine(createProject());
  const hook = renderHook(({ engine }) => useFontCanvasStatus(engine), {
    initialProps: { engine: a },
  });
  const oldRequest = hook.result.current.request;
  act(() => oldRequest({ layerId: "layer", family: "Inter", weight: 400 }, "Inter", "preview"));
  hook.rerender({ engine: b });
  act(() => oldRequest({ layerId: "layer", family: "Inter", weight: 400 }, "Inter", "preview"));
  expect(getFontPresentation(a).read().ticket).toBeNull();
  const retained = hook.result.current.request;
  hook.unmount();
  act(() => retained({ layerId: "layer", family: "Inter", weight: 400 }, "Inter", "preview"));
  expect(getFontPresentation(b).read().ticket).toBeNull();
});
