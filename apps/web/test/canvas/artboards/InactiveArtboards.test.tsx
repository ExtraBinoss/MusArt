import { createRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createPage, createProject, EditorEngine } from "@musart/core";
import { InactiveArtboards } from "../../../src/canvas/artboards/InactiveArtboards";
import { arrangeArtboards } from "../../../src/canvas/artboards/layout";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name: string }) => (options ? `${key} ${options.name}` : key),
  }),
}));
afterEach(() => vi.unstubAllGlobals());
it("uses real leased images, keyboard activation and a truthful failure state without retry loops", async () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  const a = createPage({ name: "Cover" }),
    b = createPage({ name: "Story" }),
    engine = new EditorEngine(createProject({ pages: [a, b] })),
    workspace = arrangeArtboards([a, b]),
    root = createRef<HTMLDivElement>();
  root.current = document.createElement("div");
  const release = vi.fn(),
    services = {
      loadProjectThumbnails: vi.fn(async () => ({
        items: [{ pageId: b.id, revision: "1", url: "blob:real", width: 100, height: 80 }],
        release,
      })),
      subscribeProjectThumbnails: vi.fn(() => vi.fn()),
    };
  const props = {
    engine,
    workspace,
    activeId: a.id,
    projectId: "p",
    view: { x: 0, y: 0, zoom: 0.5 },
    viewport: root,
    services,
  };
  const { rerender, unmount } = render(<InactiveArtboards {...props} />);
  const board = screen.getByRole("button", { name: "activate Story" });
  await waitFor(() => expect(screen.getByAltText("Story")).toHaveAttribute("src", "blob:real"));
  fireEvent.keyDown(board, { key: "x" });
  expect(engine.getSnapshot().pageId).toBe(a.id);
  fireEvent.keyDown(board, { key: "Enter" });
  expect(engine.getSnapshot().pageId).toBe(b.id);
  act(() => engine.setPage(a.id));
  fireEvent.keyDown(board, { key: " " });
  expect(engine.getSnapshot().pageId).toBe(b.id);
  fireEvent.error(screen.getByAltText("Story"));
  expect(screen.getByText("unavailable")).toBeInTheDocument();
  expect(services.loadProjectThumbnails).toHaveBeenCalledOnce();
  rerender(<InactiveArtboards {...props} services={undefined} />);
  expect(screen.getByText("unavailable")).toBeInTheDocument();
  unmount();
  expect(release).toHaveBeenCalledOnce();
});
