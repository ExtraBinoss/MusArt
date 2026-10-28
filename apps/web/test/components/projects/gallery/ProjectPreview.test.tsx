import { afterEach, expect, test, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import type { ProjectThumbnailLease } from "../../../../src/state/contracts";
import {
  ProjectPreview,
  HOVER_PREVIEW_INTERVAL,
} from "../../../../src/components/projects/gallery/ProjectPreview";
import { projectSummary } from "../../../support/projects";
import { setup } from "../../../support/ui";
let reduced = false;
vi.mock("motion/react", async (original) => ({
  ...(await original<typeof import("motion/react")>()),
  useReducedMotion: () => reduced,
}));
afterEach(async () => {
  if (vi.isFakeTimers())
    await act(async () => {
      vi.runOnlyPendingTimers();
    });
  vi.useRealTimers();
  vi.unstubAllGlobals();
  reduced = false;
});
async function advanceSlide() {
  await act(async () => {
    vi.advanceTimersByTime(HOVER_PREVIEW_INTERVAL);
  });
  await act(async () => {
    vi.advanceTimersByTime(500);
  });
}
function lease(): ProjectThumbnailLease {
  return {
    items: [
      { pageId: "project-a-one", revision: "v1", url: "blob:page-one", width: 320, height: 220 },
      { pageId: "project-a-two", revision: "v1", url: "blob:page-two", width: 220, height: 320 },
    ],
    release: vi.fn(),
  };
}
test("cycles only on hover, exposes no manual carousel controls and releases replaced URLs", async () => {
  const d = setup(),
    open = vi.fn(),
    leases: ProjectThumbnailLease[] = [];
  vi.mocked(d.services.loadProjectThumbnails).mockImplementation(async () => {
    const next = lease();
    leases.push(next);
    return next;
  });
  const view = d.mount(
    <ProjectPreview project={projectSummary()} services={d.services} onOpen={open} />,
  );
  await screen.findByRole("img", { name: "Page one" });
  expect(d.services.loadProjectThumbnails).toHaveBeenCalledWith("project-a", [
    "project-a-one",
    "project-a-two",
  ]);
  expect(screen.getAllByRole("button")).toHaveLength(1);
  vi.useFakeTimers();
  const button = screen.getByRole("button", { name: "Ouvrir Study" }),
    wrapper = button.parentElement!;
  fireEvent.pointerDown(wrapper, { button: 0, clientX: 100, clientY: 10 });
  fireEvent.pointerMove(wrapper, { clientX: 160, clientY: 11 });
  fireEvent.pointerUp(wrapper, { clientX: 160, clientY: 11 });
  expect(screen.getByRole("img", { name: "Page one" })).toBeVisible();
  fireEvent.pointerOver(wrapper);
  await act(async () => {
    vi.advanceTimersByTime(HOVER_PREVIEW_INTERVAL);
  });
  expect(wrapper).toHaveAttribute("data-preview-sliding", "true");
  expect(screen.getByRole("img", { name: "Page one" })).toBeVisible();
  expect(leases[0]!.release).not.toHaveBeenCalled();
  await act(async () => {
    vi.advanceTimersByTime(500);
  });
  expect(screen.getByRole("img", { name: "Page two" })).toBeVisible();
  expect(leases[0]!.release).toHaveBeenCalledOnce();
  fireEvent.pointerOut(wrapper);
  await act(async () => {
    vi.advanceTimersByTime(HOVER_PREVIEW_INTERVAL * 3);
  });
  expect(screen.getByRole("img", { name: "Page two" })).toBeVisible();
  fireEvent.click(button);
  expect(open).toHaveBeenCalledOnce();
  view.unmount();
  await act(async () => {
    await Promise.resolve();
  });
  for (const held of leases) expect(held.release).toHaveBeenCalledOnce();
  await act(async () => {
    vi.runOnlyPendingTimers();
  });
  expect(vi.getTimerCount()).toBe(0);
});
test("pauses on keyboard focus and hidden documents, resumes on blur/visibility, and honors reduced motion", async () => {
  const d = setup();
  vi.mocked(d.services.loadProjectThumbnails).mockImplementation(async () => lease());
  const view = d.mount(
    <ProjectPreview project={projectSummary()} services={d.services} onOpen={() => undefined} />,
  );
  await screen.findByRole("img", { name: "Page one" });
  vi.useFakeTimers();
  const button = screen.getByRole("button", { name: "Ouvrir Study" }),
    wrapper = button.parentElement!;
  fireEvent.pointerOver(wrapper);
  await advanceSlide();
  expect(screen.getByRole("img", { name: "Page two" })).toBeVisible();
  fireEvent.focus(button);
  await act(async () => {
    vi.advanceTimersByTime(HOVER_PREVIEW_INTERVAL * 2);
  });
  expect(screen.getByRole("img", { name: "Page two" })).toBeVisible();
  fireEvent.blur(button, { relatedTarget: document.body });
  await advanceSlide();
  expect(screen.getByRole("img", { name: "Page one" })).toBeVisible();
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  fireEvent(document, new Event("visibilitychange"));
  await advanceSlide();
  expect(screen.getByRole("img", { name: "Page one" })).toBeVisible();
  hidden.mockReturnValue(false);
  fireEvent(document, new Event("visibilitychange"));
  await advanceSlide();
  expect(screen.getByRole("img", { name: "Page two" })).toBeVisible();
  view.unmount();
  await act(async () => {
    vi.runOnlyPendingTimers();
  });
  expect(vi.getTimerCount()).toBe(0);
  reduced = true;
  const second = d.mount(
    <ProjectPreview project={projectSummary()} services={d.services} onOpen={() => undefined} />,
  );
  await act(async () => {
    await Promise.resolve();
  });
  fireEvent.pointerOver(screen.getByRole("button", { name: "Ouvrir Study" }).parentElement!);
  await act(async () => {
    vi.advanceTimersByTime(HOVER_PREVIEW_INTERVAL * 3);
  });
  expect(screen.getByRole("img", { name: "Page one" })).toBeVisible();
  second.unmount();
});
test("releases late requests and retries failures without opening the document", async () => {
  const d = setup();
  let resolve!: (value: ProjectThumbnailLease) => void;
  vi.mocked(d.services.loadProjectThumbnails).mockImplementationOnce(
    () =>
      new Promise((yes) => {
        resolve = yes;
      }),
  );
  const view = d.mount(
    <ProjectPreview project={projectSummary()} services={d.services} onOpen={() => undefined} />,
  );
  view.unmount();
  const late = lease();
  await act(async () => {
    resolve(late);
  });
  expect(late.release).toHaveBeenCalledOnce();
  vi.mocked(d.services.loadProjectThumbnails)
    .mockRejectedValueOnce(new Error("disk"))
    .mockImplementation(async () => lease());
  d.mount(
    <ProjectPreview project={projectSummary()} services={d.services} onOpen={() => undefined} />,
  );
  await screen.findByText("Aperçu indisponible");
  fireEvent.click(screen.getByRole("button", { name: "Réessayer l’aperçu" }));
  await screen.findByRole("img", { name: "Page one" });
});

test("defers invisible cards, refreshes only its project and releases URLs when scrolled away", async () => {
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
  const d = setup();
  const releases: ProjectThumbnailLease[] = [];
  let publish!: (id: string) => void;
  vi.mocked(d.services.subscribeProjectThumbnails).mockImplementation((listener) => {
    publish = listener;
    return () => undefined;
  });
  vi.mocked(d.services.loadProjectThumbnails).mockImplementation(async () => {
    const next = lease();
    releases.push(next);
    return next;
  });
  const view = d.mount(
    <ProjectPreview project={projectSummary()} services={d.services} onOpen={() => undefined} />,
  );
  expect(d.services.loadProjectThumbnails).not.toHaveBeenCalled();
  await act(async () => {
    notify([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
  });
  await screen.findByRole("img", { name: "Page one" });
  await act(async () => {
    publish("other");
  });
  expect(d.services.loadProjectThumbnails).toHaveBeenCalledOnce();
  await act(async () => {
    publish("project-a");
  });
  expect(d.services.loadProjectThumbnails).toHaveBeenCalledTimes(2);
  await act(async () => {
    notify([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
  });
  expect(screen.queryByRole("img", { name: "Page one" })).toBeNull();
  for (const held of releases) expect(held.release).toHaveBeenCalledOnce();
  view.unmount();
  expect(disconnect).toHaveBeenCalledOnce();
});
