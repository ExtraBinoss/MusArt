import { expect, test, vi } from "vitest";
import { fireEvent, screen, within, waitFor } from "@testing-library/react";
import { ProjectInsightsDialog } from "../../../../src/components/projects/insights/ProjectInsightsDialog";
import { projectSummary, projectInsights } from "../../../support/projects";
import { setup } from "../../../support/ui";
test("links bar and legend highlights, keeps history details behind contextual help and explains the undo distinction", async () => {
  const d = setup(),
    clear = vi.fn(),
    close = vi.fn();
  vi.mocked(d.services.projectInsights).mockResolvedValue(projectInsights());
  d.mount(
    <ProjectInsightsDialog
      project={projectSummary()}
      services={d.services}
      revision={0}
      onClose={close}
      onClearHistory={clear}
    />,
  );
  const bar = await screen.findByRole("group", { name: /Répartition/ });
  expect(screen.queryByText(/Ctrl\/Cmd/)).toBeNull();
  expect(screen.queryByText(/Tout le site/)).toBeNull();
  expect(screen.queryByRole("button", { name: "Effacer l’historique" })).toBeNull();
  const segment = within(bar).getByRole("button", { name: /^Images originales:/ });
  fireEvent.pointerEnter(segment);
  expect(bar.querySelector('[data-section="storedDocument"]')).toHaveAttribute(
    "data-dimmed",
    "true",
  );
  expect(bar.querySelector('[data-section="storedOriginals"]')).toHaveAttribute(
    "data-dimmed",
    "false",
  );
  fireEvent.pointerLeave(segment);
  const row = screen.getByText("Aperçus").closest(".storage-row")!;
  fireEvent.focus(row);
  expect(bar.querySelector('[data-section="storedOriginals"]')).toHaveAttribute(
    "data-dimmed",
    "true",
  );
  expect(bar.querySelector('[data-section="storedPreviews"]')).toHaveAttribute(
    "data-dimmed",
    "false",
  );
  fireEvent.blur(row);
  fireEvent.click(screen.getByRole("button", { name: "Historique enregistré" }));
  const details = await screen.findByRole("dialog", { name: "Historique enregistré" });
  expect(details).toHaveTextContent("Ctrl/Cmd+Z de cette session");
  expect(within(details).getByText("3 étapes enregistrées")).toBeVisible();
  expect(
    within(details).getByRole("group", { name: "Espace utilisé par l’historique enregistré" }),
  ).toBeVisible();
  fireEvent.click(within(details).getByRole("button", { name: "Effacer l’historique" }));
  expect(clear).toHaveBeenCalledOnce();
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Historique enregistré" })).toBeNull(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
  expect(close).toHaveBeenCalledOnce();
});
test("recovers from real read failures and disables clearing an empty paused recording", async () => {
  const d = setup();
  vi.mocked(d.services.projectInsights)
    .mockRejectedValueOnce(new Error("disk"))
    .mockResolvedValue({
      ...projectInsights(),
      history: { count: 0, limit: 10, enabled: false },
      origin: undefined,
    });
  d.mount(
    <ProjectInsightsDialog
      project={projectSummary()}
      services={d.services}
      revision={0}
      onClose={() => undefined}
      onClearHistory={() => undefined}
    />,
  );
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
  fireEvent.click(await screen.findByRole("button", { name: "Historique enregistré" }));
  const details = await screen.findByRole("dialog", { name: "Historique enregistré" });
  expect(within(details).getByText("Enregistrement suspendu")).toBeVisible();
  expect(within(details).getByRole("button", { name: "Effacer l’historique" })).toBeDisabled();
});
