import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { setup } from "../../support/ui";
import { KeyCluster } from "../../../src/components/motion/KeyCluster";
import { createTimelineGestures } from "../../../src/components/motion/gestures";
import { makeTransport } from "./support";
import { i18n } from "../../../src/state/i18n";

it("expands dense keys into bounded real choices with exact seek, collective selection and zoom", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const runtime = makeTransport(d.engine.getSnapshot().project.pages[0]!);
  const keys = Array.from({ length: 1000 }, (_, index) => ({
    id: `key-${index}`,
    time: { value: index, rate: 10000 },
    value: index,
  }));
  const gestures = createTimelineGestures({
    engine: d.engine,
    compositionId: d.engine.getSnapshot().pageId,
    transport: runtime.transport,
    onSelection: vi.fn(),
    onError: vi.fn(),
  });
  const zoom = vi.fn(),
    select = vi.fn();
  const readSelection = vi.spyOn(gestures, "readSelected");
  const translate = vi.spyOn(i18n, "t");
  d.mount(
    <KeyCluster
      keys={keys}
      first={0}
      after={1000}
      propertyId="property"
      name="Position X"
      x={0}
      unit="ms"
      gestures={gestures}
      transport={runtime.transport}
      onSelectLayer={select}
      onZoomRange={zoom}
    />,
  );
  expect(readSelection).toHaveBeenCalledOnce();
  expect(
    translate.mock.calls.some(
      ([key]) => key === "clusterTitle" || key === "selectCluster" || key === "zoomCluster",
    ),
  ).toBe(false);
  fireEvent.click(
    screen.getByRole("button", { name: "Afficher les 1000 images clés de Position X" }),
  );
  expect(screen.getAllByRole("listitem").length).toBeLessThan(20);
  fireEvent.click(
    screen.getByRole("button", { name: "Sélectionner l’image clé 2 et aller à 0.1 ms" }),
  );
  expect(runtime.transport.seek).toHaveBeenLastCalledWith({ value: 1, rate: 10000 });
  expect(gestures.readSelected()).toEqual(new Set(["key-1"]));
  expect(select).toHaveBeenCalledWith(false);
  fireEvent.click(screen.getByRole("button", { name: "Sélectionner ce groupe" }));
  expect(gestures.readSelected().size).toBe(1000);
  fireEvent.click(screen.getByRole("button", { name: "Zoomer sur ce groupe" }));
  expect(zoom).toHaveBeenCalledWith(0, 0.0999);
  expect(screen.queryByRole("dialog")).toBeNull();
  gestures.dispose();
});
