import { createRef } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createPage, createProject, EditorEngine, type EnginePort } from "@musart/core";
import { InactiveArtboards } from "../../../src/canvas/artboards/InactiveArtboards";
import { arrangeArtboards } from "../../../src/canvas/artboards/layout";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name: string }) => (options ? `${key} ${options.name}` : key),
  }),
}));
afterEach(() => vi.unstubAllGlobals());
it("a first activation can show historical artwork as stale while the genuine replacement is pending", async () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  const a = createPage({ name: "First" }),
    b = createPage({ name: "Second" }),
    engine = new EditorEngine(createProject({ pages: [a, b] })),
    root = createRef<HTMLDivElement>();
  root.current = document.createElement("div");
  const release = vi.fn(),
    services = {
      loadProjectThumbnails: vi.fn(async () => ({
        items: [
          {
            pageId: b.id,
            revision: "historical",
            url: "blob:old",
            width: 100,
            height: 80,
            stale: true,
          },
        ],
        release,
      })),
      subscribeProjectThumbnails: vi.fn(() => vi.fn()),
    },
    props = {
      engine,
      workspace: arrangeArtboards([a, b]),
      activeId: b.id,
      projectId: engine.getSnapshot().project.id,
      view: { x: 0, y: 0, zoom: 0.5 },
      viewport: root,
      services,
    };
  const view = render(<InactiveArtboards {...props} />);
  await waitFor(() => expect(screen.getByAltText("Second")).toHaveAttribute("src", "blob:old"));
  const image = screen.getByAltText("Second"),
    board = image.parentElement!;
  expect(board).toHaveAttribute("data-preview-current", "false");
  expect(board).toHaveAttribute("aria-busy", "true");
  view.rerender(<InactiveArtboards {...props} activeId={a.id} />);
  expect(screen.getByAltText("Second")).toBe(image);
  expect(board).toHaveAttribute("data-preview-available", "true");
  expect(board).toHaveAttribute("data-backdrop-active", "false");
  view.unmount();
  expect(release).toHaveBeenCalledOnce();
});
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
    projectId: engine.getSnapshot().project.id,
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
  expect(within(board).getByText("unavailable")).toBeInTheDocument();
  expect(services.loadProjectThumbnails).toHaveBeenCalledOnce();
  rerender(<InactiveArtboards {...props} services={undefined} />);
  expect(within(board).getByText("unavailable")).toBeInTheDocument();
  unmount();
  expect(release).toHaveBeenCalledOnce();
});

it("keeps decoded backdrop nodes and their leases across activation instead of replacing them with preparation UI", async () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  const a = createPage({ name: "Cover", background: "#112233" }),
    b = createPage({ name: "Story", background: "#334455" });
  const engine = new EditorEngine(createProject({ pages: [a, b] })),
    release = vi.fn();
  const services = {
    loadProjectThumbnails: vi.fn(async () => ({
      items: [a, b].map((page) => ({
        pageId: page.id,
        revision: "1",
        url: `blob:${page.id}`,
        width: 100,
        height: 80,
      })),
      release,
    })),
    subscribeProjectThumbnails: vi.fn(() => vi.fn()),
  };
  const props = {
    engine,
    workspace: arrangeArtboards([a, b]),
    activeId: a.id,
    projectId: engine.getSnapshot().project.id,
    view: { x: 0, y: 0, zoom: 1 },
    viewport: { current: document.createElement("div") },
    services,
  };
  const view = render(<InactiveArtboards {...props} />);
  try {
    const image = await screen.findByAltText("Story"),
      parent = image.parentElement;
    act(() => engine.setPage(b.id));
    view.rerender(<InactiveArtboards {...props} activeId={b.id} />);
    expect(screen.getByAltText("Story")).toBe(image);
    expect(image.parentElement).toBe(parent);
    expect(parent).toHaveAttribute("data-backdrop-active", "true");
    expect(parent).not.toHaveClass("canvas-artboard-inactive");
    expect(services.loadProjectThumbnails).toHaveBeenCalledExactlyOnceWith(
      props.projectId,
      [a.id, b.id],
      { allowStale: true },
    );
    expect(release).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "activate Cover" })).toBeInTheDocument();
  } finally {
    view.unmount();
  }
  expect(release).toHaveBeenCalledOnce();
});
it("keeps keyboard activation current after paint commits but rejects stale load and removed-board events", () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  const engine = new EditorEngine(
      createProject({ pages: [createPage({ name: "Cover" }), createPage({ name: "Story" })] }),
    ),
    original = engine.getSnapshot().project,
    a = original.pages[0]!,
    b = original.pages[1]!,
    props = {
      engine,
      workspace: arrangeArtboards(original.pages),
      activeId: a.id,
      projectId: original.id,
      view: { x: 0, y: 0, zoom: 1 },
      viewport: { current: document.createElement("div") },
    },
    view = render(<InactiveArtboards {...props} />),
    board = screen.getByRole("button", { name: "activate Story" });
  act(() => engine.execute({ type: "updatePage", patch: { background: "#112233" } }));
  fireEvent.keyDown(board, { key: "Enter" });
  expect(engine.getSnapshot().pageId).toBe(b.id);
  const replacement = structuredClone(original);
  act(() => {
    engine.load(replacement);
    fireEvent.keyDown(board, { key: "Enter" });
    expect(engine.getSnapshot().pageId).toBe(a.id);
  });
  // The fresh local render rebinds an intentional same-ID load without waiting for geometry changes.
  fireEvent.keyDown(board, { key: "Enter" });
  expect(engine.getSnapshot().pageId).toBe(b.id);
  const foreign = { ...structuredClone(original), id: "foreign-project" };
  act(() => engine.load(foreign));
  fireEvent.keyDown(board, { key: "Enter" });
  expect(engine.getSnapshot().pageId).toBe(a.id);
  view.rerender(<InactiveArtboards {...props} projectId={foreign.id} />);
  fireEvent.keyDown(board, { key: "Enter" });
  expect(engine.getSnapshot().pageId).toBe(b.id);
  act(() => {
    engine.setPage(a.id);
    engine.execute({ type: "deletePage", id: b.id });
  });
  expect(() => fireEvent.keyDown(board, { key: "Enter" })).not.toThrow();
  expect(engine.getSnapshot().pageId).toBe(a.id);
  view.unmount();
});
it("supports a minimal EnginePort without detailed observers or synchronous replacement adoption", () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  const engine = new EditorEngine(
      createProject({ pages: [createPage({ name: "Cover" }), createPage({ name: "Story" })] }),
    ),
    original = engine.getSnapshot().project,
    a = original.pages[0]!,
    b = original.pages[1]!,
    detailed = vi.spyOn(engine, "subscribeCommands"),
    summary = vi.spyOn(engine, "subscribeCommitInfo"),
    port: EnginePort = {
      getSnapshot: engine.getSnapshot,
      subscribe: engine.subscribe,
      execute: engine.execute,
      select: engine.select,
      setPage: engine.setPage,
      undo: engine.undo,
      redo: engine.redo,
      load: engine.load,
      transaction: engine.transaction,
    },
    view = render(
      <InactiveArtboards
        engine={port}
        workspace={arrangeArtboards(original.pages)}
        activeId={a.id}
        projectId={original.id}
        view={{ x: 0, y: 0, zoom: 1 }}
        viewport={{ current: document.createElement("div") }}
      />,
    ),
    board = screen.getByRole("button", { name: "activate Story" });
  act(() => {
    engine.execute({ type: "updatePage", patch: { background: "#112233" } });
    fireEvent.keyDown(board, { key: "Enter" });
    expect(engine.getSnapshot().pageId).toBe(a.id);
  });
  fireEvent.keyDown(board, { key: "Enter" });
  expect(engine.getSnapshot().pageId).toBe(b.id);
  expect(detailed).not.toHaveBeenCalled();
  expect(summary).not.toHaveBeenCalled();
  view.unmount();
});
