import { expect, test, vi } from "vitest";
import { createProject } from "@musart/core";
import { layerActions } from "../../../../src/components/layers/menu/actions";
import { setup } from "../../../support/ui";
test("uses actual selection for one atomic effect transaction and rejects stale or locked destinations", () => {
  const d = setup();
  d.engine.select([d.rectangle.id, d.text.id]);
  const page = d.engine.getSnapshot().project.pages[0]!,
    actions = layerActions(d.engine, page, d.run);
  actions.effect("grain");
  expect(
    d.engine
      .getSnapshot()
      .project.pages[0]!.layers.slice(0, 2)
      .every((layer) => layer.effects[0]?.type === "grain"),
  ).toBe(true);
  d.engine.undo();
  expect(
    d.engine.getSnapshot().project.pages[0]!.layers.every((layer) => layer.effects.length === 0),
  ).toBe(true);
  const execute = vi.spyOn(d.engine, "transaction");
  d.engine.load(createProject());
  actions.remove();
  expect(execute).not.toHaveBeenCalled();
});
test("delegates group, ungroup, mask, duplicate and delete to validated commands", () => {
  const d = setup();
  const action = () => layerActions(d.engine, d.engine.getSnapshot().project.pages[0]!, d.run);
  d.engine.select([d.rectangle.id, d.text.id]);
  action().group();
  expect(
    d.engine.getSnapshot().project.pages[0]!.layers.some((layer) => layer.kind === "group"),
  ).toBe(true);
  action().ungroup();
  d.engine.select([d.rectangle.id, d.text.id]);
  action().mask();
  expect(d.engine.getSnapshot().project.pages[0]!.layers.some((layer) => layer.mask)).toBe(true);
  action().duplicate();
  action().remove();
  d.engine.select([]);
  const before = d.engine.getSnapshot();
  action().duplicate();
  expect(d.engine.getSnapshot()).toBe(before);
});

test("deferred context operations retain their invocation selection and reject a later replacement", () => {
  const d = setup();
  d.engine.select([d.rectangle.id]);
  let pending: (() => void) | undefined;
  const actions = layerActions(d.engine, d.engine.getSnapshot().project.pages[0]!, (task) => {
    pending = task;
  });
  actions.remove();
  d.engine.select([d.text.id]);
  const before = d.engine.getSnapshot();
  pending!();
  expect(d.engine.getSnapshot()).toBe(before);
  expect(before.project.pages[0]!.layers).toHaveLength(3);
  d.engine.select([d.rectangle.id]);
  actions.duplicate();
  d.engine.load(createProject());
  const replacement = d.engine.getSnapshot();
  pending!();
  expect(d.engine.getSnapshot()).toBe(replacement);
});

test("retained menus resolve metadata before invocation without loosening queued command guards", () => {
  const d = setup();
  d.engine.select([d.rectangle.id]);
  let pending: (() => void) | undefined;
  const page = d.engine.getSnapshot().project.pages[0]!;
  const actions = layerActions(d.engine, page, (task) => {
    pending = task;
  });
  d.engine.execute({ type: "updatePage", patch: { rulers: true } });
  actions.effect("grain");
  pending!();
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]?.type).toBe("grain");

  const current = d.engine.getSnapshot().project.pages[0]!;
  const retained = layerActions(d.engine, current, (task) => {
    pending = task;
  });
  d.engine.execute({ type: "updatePage", patch: { rulers: false } });
  retained.duplicate();
  d.engine.execute({ type: "updatePage", patch: { rulers: true } });
  const intervening = d.engine.getSnapshot();
  pending!();
  expect(d.engine.getSnapshot()).toBe(intervening);

  retained.remove();
  pending!();
  expect(d.engine.getSnapshot().project.pages[0]!.layers).toHaveLength(2);
  const rejected = d.engine.getSnapshot();
  pending = undefined;
  retained.duplicate();
  actions.group();
  expect(pending).toBeUndefined();
  expect(d.engine.getSnapshot()).toBe(rejected);
});
