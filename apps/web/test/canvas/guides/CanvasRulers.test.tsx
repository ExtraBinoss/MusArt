import { afterEach, expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { createPage, createProject, EditorEngine } from "@musart/core";
import { CanvasRulers } from "../../../src/canvas/guides/CanvasRulers";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(() => vi.unstubAllGlobals());

test("ruler commands update the connected overlay while the outer canvas retains its geometry page", () => {
  const engine = new EditorEngine(createProject({ pages: [createPage({ rulers: false })] }));
  const page = engine.getSnapshot().project.pages[0]!;
  const viewport = document.createElement("div");
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 800,
    height: 600,
  } as DOMRect);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const { container } = render(
    <CanvasRulers
      engine={engine}
      page={page}
      viewport={{ current: viewport }}
      view={{ x: 0, y: 0, zoom: 1 }}
    />,
  );
  expect(container.querySelector(".canvas-rulers")).not.toBeVisible();
  act(() => engine.execute({ type: "updatePage", patch: { rulers: true } }));
  expect(screen.getByLabelText("horizontal")).toBeInTheDocument();
  expect(page.rulers).toBe(false);
  act(() => engine.execute({ type: "updatePage", patch: { rulers: false } }));
  expect(container.querySelector(".canvas-rulers")).not.toBeVisible();
});
