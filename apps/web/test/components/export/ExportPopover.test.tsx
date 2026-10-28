import { expect, test, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { choose } from "../../support/select";
import { ExportPopover } from "../../../src/components/export/ExportPopover";
import { setup } from "../../support/ui";
test("exports scaled images and all compositions at chosen quality", async () => {
  const data = setup();
  const close = vi.fn();
  data.mount(
    <ExportPopover
      open
      page={data.page}
      pageCount={2}
      services={data.services}
      onOpenChange={close}
      onTask={data.onTask}
    />,
  );
  await choose("Format", "JPEG");
  await choose("Échelle", "4×");
  expect(screen.getByText("4320 × 4320")).toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "Qualité" }), { target: { value: "90" } });
  fireEvent.blur(screen.getByRole("textbox", { name: "Qualité" }));
  fireEvent.click(screen.getByRole("switch", { name: "Tous les plans de travail (.zip)" }));
  fireEvent.click(screen.getByRole("button", { name: "Exporter l’image" }));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(data.services.exportImage).toHaveBeenCalledWith(
    {
      scale: 4,
      format: "jpeg",
      quality: 0.9,
      allPages: true,
    },
    { page: data.page, revision: 0, selection: [] },
  );
});
test("leaves failed export open and closes on cancel or Escape", async () => {
  const data = setup();
  const close = vi.fn();
  vi.mocked(data.services.exportImage).mockRejectedValue(new Error("GPU lost"));
  data.mount(
    <ExportPopover
      open
      page={data.page}
      pageCount={1}
      services={data.services}
      onOpenChange={close}
      onTask={data.onTask}
    />,
  );
  expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Exporter l’image" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Exporter l’image" })).not.toBeDisabled(),
  );
  expect(close).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  expect(close).toHaveBeenCalledTimes(2);
});
