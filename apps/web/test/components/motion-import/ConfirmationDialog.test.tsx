import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { planMotionInitialization } from "@musart/core";
import { MotionImportConfirmation } from "../../../src/components/motion-import/ConfirmationDialog";
import { getMotionConfirmation } from "../../../src/state/session/motion-confirmation";
import { setup } from "../../support/ui";

test("shows the staged four-item count in a genuine Radix dialog, focuses cancellation and returns the user's exact decision", async () => {
  const d = setup(),
    port = getMotionConfirmation(d.engine);
  const view = d.mount(<MotionImportConfirmation engine={d.engine} />);
  const plan = planMotionInitialization(d.engine.getSnapshot());
  plan.layerIds.push("staged-video");
  plan.requiresConfirmation = true;
  const before = d.engine.getSnapshot();
  let result!: Promise<boolean>;
  act(() => {
    result = port.request(plan);
  });
  const dialog = screen.getByRole("alertdialog");
  expect(dialog).toHaveTextContent("4 éléments, dont la vidéo importée");
  expect(dialog).toHaveTextContent("Les groupes et leurs enfants sont inclus");
  const cancel = screen.getByRole("button", { name: "Non, annuler l’import" });
  expect(cancel).toHaveFocus();
  fireEvent.click(cancel);
  await expect(result).resolves.toBe(false);
  expect(screen.queryByRole("alertdialog")).toBeNull();
  act(() => {
    result = port.request(plan);
  });
  fireEvent.click(screen.getByRole("button", { name: "Oui, importer en Motion" }));
  await expect(result).resolves.toBe(true);
  expect(d.engine.getSnapshot()).toBe(before);
  view.unmount();
});

test("cancels on Escape/unmount and rejects stale conversion without accepting or changing any document", async () => {
  const d = setup(),
    port = getMotionConfirmation(d.engine);
  const view = d.mount(<MotionImportConfirmation engine={d.engine} />);
  const plan = {
    ...planMotionInitialization(d.engine.getSnapshot()),
    layerIds: ["one", "two", "three", "incoming"],
    requiresConfirmation: true,
  };
  let result!: Promise<boolean>;
  act(() => {
    result = port.request(plan);
  });
  fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
  await expect(result).resolves.toBe(false);
  act(() => {
    result = port.request(plan);
  });
  const stale = expect(result).rejects.toMatchObject({ code: "stale" });
  act(() => d.engine.execute({ type: "renameProject", name: "Changed" }));
  await stale;
  expect(screen.queryByRole("alertdialog")).toBeNull();
  act(() => {
    result = port.request({ ...plan, revision: d.engine.getSnapshot().revision });
  });
  view.unmount();
  await expect(result).resolves.toBe(false);
  expect(d.engine.getSnapshot().project.pages[0]!.motion).toBeUndefined();
});

test("transition conversion uses honest generic copy while keeping import wording unchanged elsewhere", async () => {
  const d = setup(),
    port = getMotionConfirmation(d.engine);
  const mount = d.mount(<MotionImportConfirmation engine={d.engine} />);
  const plan = {
    ...planMotionInitialization(d.engine.getSnapshot()),
    layerIds: ["one", "two", "three", "four"],
    requiresConfirmation: true,
  };
  let result!: Promise<boolean>;
  act(() => {
    result = port.request(plan, { reason: "transition" });
  });
  expect(screen.getByRole("alertdialog")).toHaveTextContent(
    "4 éléments seront ajoutés à la timeline avant de choisir une transition",
  );
  expect(screen.getByRole("alertdialog")).not.toHaveTextContent("vidéo importée");
  fireEvent.click(screen.getByRole("button", { name: "Non, garder statique" }));
  await expect(result).resolves.toBe(false);
  expect(d.engine.getSnapshot().project.pages[0]!.motion).toBeUndefined();
  mount.unmount();
});
