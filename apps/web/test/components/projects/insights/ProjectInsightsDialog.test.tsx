import { expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { ProjectInsightsDialog } from "../../../../src/components/projects/insights/ProjectInsightsDialog";
import { projectSummary, projectInsights } from "../../../support/projects";
import { setup } from "../../../support/ui";
test("shows measured project bytes, journal details and the separate browser estimate", async () => {
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
  expect(screen.getByRole("status")).toHaveTextContent("Analyse");
  await screen.findByText("Détail du journal");
  expect(screen.getByText(/3 entrées enregistrées · limite 10\s000/)).toBeVisible();
  expect(screen.getByText(/allocation réelle sur disque/)).toBeVisible();
  expect(screen.getByText(/Tout le site/)).toBeVisible();
  expect(screen.getByRole("img", { name: /Répartition/ })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Effacer l’historique" }));
  expect(clear).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
  expect(close).toHaveBeenCalledOnce();
});
test("recovers from failures and disables clearing an empty paused journal", async () => {
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
  await screen.findByText("Enregistrement suspendu");
  expect(screen.getByRole("button", { name: "Effacer l’historique" })).toBeDisabled();
  expect(screen.queryByText(/Tout le site/)).toBeNull();
});
