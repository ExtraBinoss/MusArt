import { expect, test, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { RecentProject } from "../../../../src/components/projects/dashboard/RecentProject";
import type { ProjectThumbnailLease } from "../../../../src/state/contracts";
import { setup } from "../../../support/ui";
import { projectSummary } from "../../../support/projects";

function lease(url: string, pageId: string): ProjectThumbnailLease {
  return { items: [{ pageId, revision: url, url, width: 40, height: 40 }], release: vi.fn() };
}

test("shows the first cached page, releases replaced leases and reports decode errors", async () => {
  const d = setup(),
    project = projectSummary("durable-project", "Study");
  const pageId = project.pages[0]!.id;
  const first = lease("blob:first", pageId),
    next = lease("blob:next", pageId);
  let changed!: (id: string) => void;
  const unsubscribe = vi.fn();
  vi.mocked(d.services.subscribeProjectThumbnails).mockImplementation((listener) => {
    changed = listener;
    return unsubscribe;
  });
  vi.mocked(d.services.loadProjectThumbnails)
    .mockResolvedValueOnce(first)
    .mockResolvedValueOnce(next);
  const view = d.mount(
    <RecentProject
      project={project}
      services={d.services}
      onTask={d.onTask}
      busy={false}
      onOpen={vi.fn()}
    />,
  );
  await waitFor(() =>
    expect(view.container.querySelector("img")).toHaveAttribute("src", "blob:first"),
  );
  expect(d.services.loadProjectThumbnails).toHaveBeenCalledExactlyOnceWith("durable-project", [
    pageId,
  ]);
  act(() => changed("different-project"));
  expect(d.services.loadProjectThumbnails).toHaveBeenCalledTimes(1);
  act(() => changed("durable-project"));
  await waitFor(() =>
    expect(view.container.querySelector("img")).toHaveAttribute("src", "blob:next"),
  );
  expect(first.release).toHaveBeenCalledOnce();
  fireEvent.error(view.container.querySelector("img")!);
  expect(view.container.querySelector("img")).toBeNull();
  await waitFor(() => expect(d.onTask).toHaveLastResolvedWith(false));
  view.unmount();
  expect(next.release).toHaveBeenCalledOnce();
  expect(unsubscribe).toHaveBeenCalledOnce();
});

test("late thumbnail completions release their lease after unmount and read failures remain visible", async () => {
  const d = setup(),
    project = projectSummary("p", "Stored project");
  const result = lease("blob:late", project.pages[0]!.id);
  let resolve!: (lease: ProjectThumbnailLease) => void;
  vi.mocked(d.services.loadProjectThumbnails).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const view = d.mount(
    <RecentProject
      project={project}
      services={d.services}
      onTask={d.onTask}
      busy={false}
      onOpen={vi.fn()}
    />,
  );
  view.unmount();
  await act(async () => resolve(result));
  expect(result.release).toHaveBeenCalledOnce();
  vi.mocked(d.services.loadProjectThumbnails).mockRejectedValueOnce(
    new Error("Preview store failed"),
  );
  d.mount(
    <RecentProject
      project={project}
      services={d.services}
      onTask={d.onTask}
      busy={false}
      onOpen={vi.fn()}
    />,
  );
  await waitFor(() => expect(d.onTask).toHaveLastResolvedWith(false));
  expect(
    screen.getByRole("button", { name: "Ouvrir le projet récent Stored project" }),
  ).toBeVisible();
});

test("hidden rows load no thumbnails until intersection and disconnect their observer", async () => {
  const d = setup(),
    project = projectSummary();
  let intersect!: IntersectionObserverCallback;
  const disconnect = vi.fn();
  const old = globalThis.IntersectionObserver;
  globalThis.IntersectionObserver = class {
    constructor(callback: IntersectionObserverCallback) {
      intersect = callback;
    }
    observe() {}
    disconnect = disconnect;
  } as unknown as typeof IntersectionObserver;
  try {
    const result = lease("blob:visible", project.pages[0]!.id);
    vi.mocked(d.services.loadProjectThumbnails).mockResolvedValue(result);
    const view = d.mount(
      <RecentProject
        project={project}
        services={d.services}
        onTask={d.onTask}
        busy={false}
        onOpen={vi.fn()}
      />,
    );
    expect(d.services.loadProjectThumbnails).not.toHaveBeenCalled();
    act(() =>
      intersect(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
    await waitFor(() =>
      expect(view.container.querySelector("img")).toHaveAttribute("src", "blob:visible"),
    );
    act(() =>
      intersect(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
    expect(view.container.querySelector("img")).toBeNull();
    expect(result.release).toHaveBeenCalledOnce();
    view.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  } finally {
    globalThis.IntersectionObserver = old;
  }
});
