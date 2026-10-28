import { expect, test } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { AlignmentPanel } from "../../../src/components/properties/AlignmentPanel";
import { setup } from "../../support/ui";
test("chooses the reference implicitly and executes real alignment/distribution commands", () => {
  const d = setup();
  const selected = [d.rectangle, d.text, d.image];
  d.mount(<AlignmentPanel engine={d.engine} selected={selected} run={d.run} />);
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Aligner dans la sélection" })).toBeVisible();
  fireEvent.click(screen.getByLabelText("Aligner à gauche de la référence"));
  expect(d.run).toHaveBeenCalledOnce();
  const xs = d.engine.getSnapshot().project.pages[0]!.layers.map((layer) => layer.x);
  expect(new Set(xs).size).toBe(1);
  fireEvent.click(screen.getByLabelText("Répartir horizontalement"));
  fireEvent.click(screen.getByLabelText("Répartir verticalement"));
  expect(d.engine.getSnapshot().canUndo).toBe(true);
});
