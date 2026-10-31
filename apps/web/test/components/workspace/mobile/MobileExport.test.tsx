import { expect, test, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { EditorServices } from "../../../../src/state/contracts";
import { MobileExport } from "../../../../src/components/workspace/mobile/MobileExport";
import { setup } from "../../../support/ui";

test("mobile exports the actual captured selection through the common artboard service", async () => {
  const d = setup(),
    close = vi.fn();
  d.engine.select([d.rectangle.id]);
  d.services.exportComposition = vi.fn<NonNullable<EditorServices["exportComposition"]>>(
    async () => ({
      mode: "static",
      filename: "selection.png",
      mimeType: "image/png",
      bytes: 4,
      width: 200,
      height: 100,
    }),
  );
  d.mount(<MobileExport engine={d.engine} services={d.services} onClose={close} />);
  expect(document.querySelector(".export-workspace")).not.toBeNull();
  expect(screen.getByRole("radio", { name: "Image" })).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Exporter l’image" }));
  await waitFor(() => expect(screen.getByText("Export prêt.")).toBeVisible());
  expect(d.services.exportComposition).toHaveBeenCalledWith(
    expect.objectContaining({
      background: true,
      selection: [d.rectangle.id],
      image: expect.objectContaining({ selectionOnly: true }),
    }),
    expect.objectContaining({ revision: d.engine.getSnapshot().revision }),
  );
  expect(close).not.toHaveBeenCalled();
});

test("mobile failures retain the real cause, leave the dialog open and allow closing", async () => {
  const d = setup(),
    close = vi.fn();
  d.services.exportComposition = vi.fn().mockRejectedValue(new Error("Encoding failed"));
  d.mount(<MobileExport engine={d.engine} services={d.services} onClose={close} />);
  fireEvent.click(screen.getByRole("button", { name: "Exporter l’image" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Encoding failed");
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(document.querySelector(".export-footer-actions button")!);
  expect(close).toHaveBeenCalledOnce();
});
