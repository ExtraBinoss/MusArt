import { expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { ProjectMotionPreview } from "../../../../src/components/projects/gallery/ProjectMotionPreview";
import { startMotionPreview } from "../../../../src/components/projects/templates/motion-preview/runtime";
import { setup } from "../../../support/ui";

vi.mock("../../../../src/components/projects/templates/motion-preview/runtime", () => ({
  startMotionPreview: vi.fn(() => ({ release: vi.fn(async () => undefined) })),
}));

test("saved Motion hover loads only on intent and returns the exact artboard/original resolver without publishing", async () => {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      ({
        matches: query.includes("hover"),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
  const d = setup(),
    resolveOriginal = vi.fn(),
    resolver = { resolveOriginal };
  d.services.loadProjectPreview = vi.fn(async () => d.project);
  d.services.mediaResolverFor = vi.fn(() => resolver);
  d.mount(
    <button>
      <ProjectMotionPreview
        projectId={d.project.id}
        pageId={d.page.id}
        services={d.services}
        poster="cached.webp"
      />
    </button>,
  );
  expect(d.services.loadProjectPreview).not.toHaveBeenCalled();
  const before = d.engine.getSnapshot();
  fireEvent.pointerEnter(screen.getByRole("button"));
  const options = vi.mocked(startMotionPreview).mock.calls.at(-1)![0],
    signal = new AbortController().signal;
  expect(await options.prepare(signal)).toEqual({
    project: d.project,
    compositionId: d.page.id,
    mediaResolver: resolver,
    fontResolver: undefined,
  });
  expect(d.services.loadProjectPreview).toHaveBeenCalledExactlyOnceWith(d.project.id, { signal });
  expect(d.engine.getSnapshot()).toBe(before);
  expect(d.services.openProject).not.toHaveBeenCalled();
  expect(d.services.createProject).not.toHaveBeenCalled();
});

test("late saved-project reads are rejected after cancellation instead of publishing a stale frame", async () => {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      ({
        matches: query.includes("hover"),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
  const d = setup(),
    request = new AbortController();
  d.services.loadProjectPreview = vi.fn(async () => {
    request.abort();
    return d.project;
  });
  d.mount(
    <button>
      <ProjectMotionPreview projectId={d.project.id} pageId={d.page.id} services={d.services} />
    </button>,
  );
  fireEvent.pointerEnter(screen.getByRole("button"));
  const options = vi.mocked(startMotionPreview).mock.calls.at(-1)![0];
  await expect(options.prepare(request.signal)).rejects.toMatchObject({ name: "AbortError" });
});
