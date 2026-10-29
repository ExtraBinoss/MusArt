import { expect, test, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { LibrarySidebar } from "../../../../src/components/projects/dashboard/LibrarySidebar";
import { setup } from "../../../support/ui";
import { projectSummary } from "../../../support/projects";

function props(d: ReturnType<typeof setup>) {
  return {
    services: d.services,
    onTask: d.onTask,
    view: "projects" as const,
    busy: false,
    onViewChange: vi.fn(),
    onChooseRecent: vi.fn(),
    onPreferences: vi.fn(),
  };
}

test("lists at most five recent durable IDs and delegates navigation/open without reading originals", async () => {
  const d = setup(),
    p = props(d);
  vi.mocked(d.services.listProjectPage).mockResolvedValue({
    projects: Array.from({ length: 7 }, (_, index) =>
      projectSummary(`durable-${index}`, `Recent ${index}`),
    ),
    before: null,
  });
  const view = d.mount(<LibrarySidebar {...p} />);
  await screen.findByRole("button", { name: "Ouvrir le projet récent Recent 0" });
  expect(d.services.listProjectPage).toHaveBeenCalledExactlyOnceWith({ limit: 5 });
  expect(screen.getAllByRole("button", { name: /Ouvrir le projet récent/ })).toHaveLength(5);
  expect(screen.getByRole("button", { name: /Communauté · Bientôt/ })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Projets" })).toHaveAttribute("aria-current", "page");
  fireEvent.click(screen.getByRole("button", { name: "Templates" }));
  expect(p.onViewChange).toHaveBeenCalledExactlyOnceWith("templates");
  fireEvent.click(screen.getByRole("button", { name: "Ouvrir le projet récent Recent 3" }));
  expect(p.onChooseRecent).toHaveBeenCalledExactlyOnceWith("durable-3");
  expect(d.services.openProject).not.toHaveBeenCalled();
  expect(d.services.flushThumbnails).not.toHaveBeenCalled();
  expect(d.services.loadProjectThumbnails).toHaveBeenCalledTimes(5);
  for (const [, pageIds] of vi.mocked(d.services.loadProjectThumbnails).mock.calls)
    expect(pageIds).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Préférences" }));
  expect(p.onPreferences).toHaveBeenCalledOnce();
  view.rerender(<LibrarySidebar {...p} busy />);
  expect(screen.getByRole("button", { name: "Ouvrir le projet récent Recent 3" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Templates" })).toBeDisabled();
});

test("reports real metadata failures, retries deliberately and ignores stale unmounted reads", async () => {
  const d = setup(),
    p = props(d);
  vi.mocked(d.services.listProjectPage).mockRejectedValueOnce(
    new Error("Stored metadata unavailable"),
  );
  const view = d.mount(<LibrarySidebar {...p} />);
  await screen.findByText("Les projets récents sont indisponibles.");
  expect(d.onTask).toHaveLastResolvedWith(false);
  expect(d.services.listProjectPage).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
  await screen.findByText("Vos prochains projets apparaîtront ici.");
  expect(d.services.listProjectPage).toHaveBeenCalledTimes(2);
  view.unmount();
  let resolve!: (result: { projects: ReturnType<typeof projectSummary>[]; before: null }) => void;
  vi.mocked(d.services.listProjectPage).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const late = d.mount(<LibrarySidebar {...p} />);
  late.unmount();
  await act(async () => resolve({ projects: [projectSummary("late", "Late")], before: null }));
  expect(d.services.loadProjectThumbnails).not.toHaveBeenCalled();
});

test("refreshes small metadata after an operation ends and rejects its superseded result", async () => {
  const d = setup(),
    p = props(d);
  let first!: (result: { projects: ReturnType<typeof projectSummary>[]; before: null }) => void;
  vi.mocked(d.services.listProjectPage).mockImplementationOnce(
    () =>
      new Promise((done) => {
        first = done;
      }),
  );
  const view = d.mount(<LibrarySidebar {...p} />);
  view.rerender(<LibrarySidebar {...p} busy />);
  vi.mocked(d.services.listProjectPage).mockResolvedValue({
    projects: [projectSummary("current", "Current")],
    before: null,
  });
  view.rerender(<LibrarySidebar {...p} />);
  await screen.findByRole("button", { name: "Ouvrir le projet récent Current" });
  await act(async () => first({ projects: [projectSummary("old", "Deleted")], before: null }));
  expect(screen.queryByRole("button", { name: "Ouvrir le projet récent Deleted" })).toBeNull();
  await waitFor(() => expect(d.services.loadProjectThumbnails).toHaveBeenCalledTimes(1));
});
