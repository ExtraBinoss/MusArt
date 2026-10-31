import { expect, test, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { ProjectActionDialog } from "../../../../src/components/projects/actions/ProjectActionDialog";
import { setup } from "../../../support/ui";
test("requires confirmation before clearing a journal, keeps failures visible and blocks repeated submits", async () => {
  const d = setup(),
    cancel = vi.fn();
  let resolve!: (ok: boolean) => void;
  const confirm = vi.fn(
    () =>
      new Promise<boolean>((yes) => {
        resolve = yes;
      }),
  );
  d.mount(
    <ProjectActionDialog
      name="Study"
      action="clearHistory"
      onCancel={cancel}
      onConfirm={confirm}
    />,
  );
  expect(screen.getByRole("alertdialog")).toHaveAccessibleName(
    "Effacer l’historique de « Study » ?",
  );
  expect(screen.getByRole("alertdialog")).toHaveTextContent(
    "Ctrl/Cmd+Z de cette session sont conservés",
  );
  fireEvent.click(screen.getByRole("button", { name: "Effacer l’historique" }));
  expect(confirm).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "En cours…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Annuler" })).toBeDisabled();
  await act(async () => {
    resolve(false);
  });
  expect(await screen.findByRole("alert")).toHaveTextContent("Réessayez");
  expect(cancel).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Effacer l’historique" }));
  await act(async () => {
    resolve(true);
  });
  await waitFor(() => expect(cancel).toHaveBeenCalledOnce());
});
test("uses destructive project copy and safely handles thrown failures and cancellation", async () => {
  const d = setup(),
    cancel = vi.fn();
  d.mount(
    <ProjectActionDialog
      name="Study"
      action="delete"
      onCancel={cancel}
      onConfirm={vi.fn().mockRejectedValue(new Error("disk"))}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Supprimer définitivement" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  expect(cancel).toHaveBeenCalledOnce();
});
