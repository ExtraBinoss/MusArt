import { expect, test } from "vitest";
import { createLayer, createPage, EFFECT_CATALOG } from "@musart/core";
import { setup } from "../../../support/ui";
import { i18n } from "../../../../src/state/i18n";
import {
  createSearchItems,
  createSearchCommandItems,
} from "../../../../src/components/search/catalog/items";
import "../../../../src/components/search/messages";
const t = (key: string, values?: Record<string, unknown>) => String(i18n.t(key, values));
test("indexes all real actions, effects and every page/layer with localized labels", () => {
  const d = setup();
  const page = createPage({
    name: "Story",
    layers: [createLayer("text", { name: "Légende", text: "Café du matin" })],
  });
  d.engine.execute({ type: "addPage", page });
  const items = createSearchItems(d.engine.getSnapshot(), t);
  expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  expect(items.filter((item) => item.target.kind === "effect")).toHaveLength(
    Object.values(EFFECT_CATALOG).filter((effect) => !effect.source).length,
  );
  for (const definition of Object.values(EFFECT_CATALOG).filter((effect) => !effect.source)) {
    const label = t(definition.nameKey);
    expect(label).not.toBe(definition.nameKey);
    expect(items.find((item) => item.id === `effect:${definition.type}`)).toMatchObject({
      label,
      target: { kind: "effect", effect: definition.type },
    });
  }
  expect(items.filter((item) => item.category === "layers")).toHaveLength(4);
  expect(items.find((item) => item.label === "Légende")).toMatchObject({
    detail: "Texte · Story",
    terms: expect.stringContaining("Café du matin"),
    target: { pageId: page.id },
  });
  expect(items.find((item) => item.id === "action:toolShape")?.label).toBe("Forme");
  expect(items.find((item) => item.id === "action:undo")?.disabled).toBeUndefined();
  expect(items.find((item) => item.id === "action:redo")?.disabled).toBeTruthy();
});
test("reflects selection, groups, undo and locked ancestors in disabled reasons", () => {
  const d = setup();
  const find = (id: string) =>
    createSearchItems(d.engine.getSnapshot(), t).find((item) => item.id === id)!;
  expect(find("action:undo").disabled).toBeTruthy();
  expect(find("effect:dither").disabled).toBeTruthy();
  expect(find("action:deselect").disabled).toBeTruthy();
  expect(find("action:group").disabled).toBeTruthy();
  d.engine.select([d.rectangle.id, d.text.id]);
  expect(find("action:group").disabled).toBeUndefined();
  expect(find("effect:dither").disabled).toBeUndefined();
  expect(find("action:deselect").disabled).toBeUndefined();
  d.engine.execute({ type: "groupLayers", ids: [d.rectangle.id, d.text.id] });
  const group = d.engine.getSnapshot().selection[0]!;
  expect(find("action:ungroup").disabled).toBeUndefined();
  d.engine.execute({ type: "updateLayers", ids: [group], patch: { locked: true } });
  d.engine.select([d.rectangle.id]);
  expect(find("effect:dither").disabled).toBeTruthy();
  expect(find("action:group").disabled).toBeTruthy();
  expect(find("action:ungroup").disabled).toBeTruthy();
  expect(find("action:toggleLock").disabled).toBeUndefined();
  d.engine.undo();
  expect(find("action:redo").disabled).toBeUndefined();
  const snapshot = d.engine.getSnapshot();
  expect(createSearchItems({ ...snapshot, pageId: "missing" }, t)).not.toHaveLength(0);
});

test("builds command availability for ten thousand selected layers through indexed membership and ancestry", () => {
  const d = setup(),
    layers = Array.from({ length: 10_000 }, (_, index) =>
      createLayer("rectangle", { id: `indexed-${index}`, locked: index === 9999 }),
    );
  const selection = new Proxy(
    layers.map((layer) => layer.id),
    {
      get(target, key, receiver) {
        if (key === "includes") throw new Error("Quadratic selection membership scan");
        return Reflect.get(target, key, receiver);
      },
    },
  );
  const page = createPage({ layers });
  page.layers = new Proxy(layers, {
    get(target, key, receiver) {
      if (key === "find" || key === "findIndex") throw new Error("Repeated linear layer lookup");
      return Reflect.get(target, key, receiver);
    },
  });
  const original = d.engine.getSnapshot();
  const snapshot = {
    ...original,
    selection,
    pageId: page.id,
    project: { ...original.project, pages: [page] },
  };
  const items = createSearchCommandItems(snapshot, t);
  expect(items.find((item) => item.id === "effect:gradient")?.disabled).toBeTruthy();
  expect(items.find((item) => item.id === "action:toggleLock")?.disabled).toBeUndefined();
  expect(items.find((item) => item.id === "action:group")?.disabled).toBeTruthy();
});
