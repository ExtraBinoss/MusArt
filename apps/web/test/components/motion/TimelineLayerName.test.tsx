import { fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { TimelineLayerName } from "../../../src/components/motion/TimelineLayerName";
import { setup } from "../../support/ui";
test("renames the canonical layer once and stale project replacement is rejected", () => {
  const d = setup(),
    commands = vi.spyOn(d.engine, "execute");
  d.mount(
    <TimelineLayerName
      engine={d.engine}
      compositionId={d.page.id}
      layerId={d.rectangle.id}
      name={d.rectangle.name}
      label="Choose layer"
      onSelect={vi.fn()}
    />,
  );
  fireEvent.doubleClick(screen.getByRole("button"));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Edited" } });
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
  expect(commands).toHaveBeenCalledOnce();
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.name).toBe("Edited");
  fireEvent.doubleClick(screen.getByRole("button"));
  d.engine.load(structuredClone(d.engine.getSnapshot().project));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Stale" } });
  fireEvent.blur(screen.getByRole("textbox"));
  expect(commands).toHaveBeenCalledOnce();
  expect(screen.getByRole("alert")).toHaveTextContent("changé");
});
