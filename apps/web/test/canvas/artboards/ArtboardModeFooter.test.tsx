import { fireEvent, screen } from "@testing-library/react";
import { createLayer } from "@musart/core";
import { expect, it } from "vitest";
import { setup } from "../../support/ui";
import { arrangeArtboards } from "../../../src/canvas/artboards/layout";
import { ArtboardModeFooter } from "../../../src/canvas/artboards/ArtboardModeFooter";

it("keeps accessible mode icons at extreme zoom and edits the active composition", () => {
  const fixture = setup();
  fixture.engine.execute({ type: "addLayers", layers: [createLayer("rectangle")] });
  const workspace = arrangeArtboards(fixture.engine.getSnapshot().project.pages);
  const view = fixture.mount(
    <ArtboardModeFooter
      engine={fixture.engine}
      workspace={workspace}
      view={{ x: 0, y: 0, zoom: 0.01 }}
    />,
  );
  expect(view.container.querySelector(".artboard-mode-footer")).toHaveAttribute(
    "data-compact",
    "true",
  );
  expect(screen.getByRole("radio", { name: "Statique" })).toBeVisible();
  expect(screen.getByRole("radio", { name: "Motion" })).toBeVisible();
  fireEvent.click(screen.getByRole("radio", { name: "Motion" }));
  fireEvent.click(screen.getByRole("button", { name: "Oui, activer Motion" }));
  expect(fixture.engine.getSnapshot().project.pages[0]!.motion?.mode).toBe("motion");
  fireEvent.click(screen.getByRole("radio", { name: "Statique" }));
  expect(fixture.engine.getSnapshot().project.pages[0]!.motion?.tracks).toHaveLength(4);
  view.unmount();
});
