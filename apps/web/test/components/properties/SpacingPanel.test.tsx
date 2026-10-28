import { expect, test, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { SpacingPanel } from "../../../src/components/properties/SpacingPanel";
import { setup } from "../../support/ui";
test("previews and commits independent page and layer insets without conflating edges", () => {
  const d = setup(),
    layerPatch = vi.fn(),
    pagePatch = vi.fn(),
    layerPreview = vi.fn(),
    pagePreview = vi.fn(),
    cancel = vi.fn();
  const props = {
    page: d.page,
    onLayerPatch: layerPatch,
    onPagePatch: pagePatch,
    onLayerPreview: layerPreview,
    onPagePreview: pagePreview,
    onCancel: cancel,
  };
  const view = d.mount(<SpacingPanel {...props} />);
  fireEvent.change(screen.getByLabelText("Haut"), { target: { value: "24" } });
  expect(pagePreview).toHaveBeenCalledWith({ margins: { top: 24, right: 0, bottom: 0, left: 0 } });
  fireEvent.blur(screen.getByLabelText("Haut"));
  expect(pagePatch).toHaveBeenCalledWith({ margins: { top: 24, right: 0, bottom: 0, left: 0 } });
  view.rerender(<SpacingPanel {...props} layer={d.rectangle} />);
  fireEvent.change(screen.getAllByLabelText("Gauche")[1]!, { target: { value: "12" } });
  expect(layerPreview).toHaveBeenCalledWith({ padding: { top: 0, right: 0, bottom: 0, left: 12 } });
  fireEvent.blur(screen.getAllByLabelText("Gauche")[1]!);
  expect(layerPatch).toHaveBeenCalledWith({ padding: { top: 0, right: 0, bottom: 0, left: 12 } });
  fireEvent.keyDown(screen.getAllByLabelText("Haut")[0]!, { key: "Escape" });
  expect(cancel).toHaveBeenCalled();
});
