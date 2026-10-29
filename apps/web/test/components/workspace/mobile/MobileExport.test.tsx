import { expect, test, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { MobileExport } from "../../../../src/components/workspace/mobile/MobileExport";
import { setup } from "../../../support/ui";

test("exports the actual selected scope/revision and releases pending protection on success", async () => {
  const d = setup(),
    close = vi.fn(),
    pending = vi.fn();
  d.engine.select([d.rectangle.id]);
  d.mount(
    <MobileExport
      engine={d.engine}
      services={d.services}
      onTask={d.onTask}
      onClose={close}
      onPendingChange={pending}
    />,
  );
  const snapshot = d.engine.getSnapshot();
  expect(screen.getByText("200 × 100")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Exporter l’image" }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(d.services.exportImage).toHaveBeenCalledWith(
    expect.objectContaining({ selectionOnly: true }),
    { page: snapshot.project.pages[0], revision: snapshot.revision, selection: [d.rectangle.id] },
  );
  expect(pending.mock.calls.map(([value]) => value)).toEqual([true, false]);
});

test("failed exports remain in the sheet and committed scope changes stay local", async () => {
  const d = setup(),
    close = vi.fn();
  vi.mocked(d.services.exportImage).mockRejectedValueOnce(new Error("Encoding failed"));
  d.mount(
    <MobileExport
      engine={d.engine}
      services={d.services}
      onTask={d.onTask}
      onClose={close}
      onPendingChange={vi.fn()}
    />,
  );
  act(() => d.engine.select([d.rectangle.id]));
  expect(screen.getByText("200 × 100")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Exporter l’image" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Exporter l’image" })).not.toBeDisabled(),
  );
  expect(close).not.toHaveBeenCalled();
  expect(document.querySelector(".export-popover")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  expect(close).toHaveBeenCalledOnce();
});
