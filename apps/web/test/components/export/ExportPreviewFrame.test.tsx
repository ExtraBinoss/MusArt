import { expect, test } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { ExportPreviewFrame } from "../../../src/components/export/ExportPreviewFrame";
import { setup } from "../../support/ui";
import "../../../src/components/export/messages";
test("fits a padded item and offers an explicitly scrollable enlarged preview", () => {
  setup().mount(
    <ExportPreviewFrame
      url="blob:real-preview"
      loading={false}
      width={320}
      height={180}
      format="jpeg"
    />,
  );
  const image = screen.getByRole("img", { name: "Aperçu de l’export" });
  expect(image).toHaveAttribute("data-format", "jpeg");
  const body = document.querySelector(".export-preview-body")!;
  expect(body).toHaveAttribute("data-expanded", "false");
  fireEvent.click(screen.getByRole("button", { name: "Agrandir l’aperçu" }));
  expect(body).toHaveAttribute("data-expanded", "true");
  expect(body).toHaveStyle({ width: "668px", height: "388px" });
  fireEvent.click(screen.getByRole("button", { name: "Ajuster l’aperçu" }));
  expect(body).toHaveAttribute("data-expanded", "false");
});
test("reports pending and unavailable real renders without a fabricated image", () => {
  const data = setup();
  const view = data.mount(
    <ExportPreviewFrame url={null} loading width={0} height={0} format="png" />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Préparation de l’aperçu");
  expect(screen.queryByRole("img")).toBeNull();
  view.rerender(
    <ExportPreviewFrame url={null} loading={false} width={0} height={0} format="webp" />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Aperçu indisponible");
  expect(screen.queryByRole("button")).toBeNull();
});
