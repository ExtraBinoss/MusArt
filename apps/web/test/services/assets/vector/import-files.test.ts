import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createPage, createProject } from "@musart/core";
import { setup } from "../../../support/ui";
import {
  importVectorFiles,
  VectorImportError,
} from "../../../../src/services/assets/vector/import-files";
const source =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 100 80"><path fill="#ee3355" d="M10 20L100 20L10 80Z"/></svg>';
function file(name = "art.svg", text: () => Promise<string> = async () => source) {
  return Object.assign(new File([source], name, { type: "image/svg+xml" }), { text });
}
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => ({
    fillStyle: "#000000",
  })) as unknown as HTMLCanvasElement["getContext"]);
  vi.stubGlobal("CSS", { supports: () => true });
});
afterEach(() => vi.unstubAllGlobals());
test("imports portable original-color vector geometry in one undoable transaction without original assets", async () => {
  const d = setup(),
    original = d.engine.getSnapshot().project;
  await importVectorFiles(d.engine, [file("Brand.svg"), file("Other.svg")]);
  const snapshot = d.engine.getSnapshot(),
    layers = snapshot.project.pages[0]!.layers.slice(3);
  expect(layers).toHaveLength(2);
  expect(layers[0]).toMatchObject({
    kind: "vector",
    name: "Brand",
    width: 100,
    height: 80,
    vector: { viewBox: "10 20 100 80", preserveColors: true, parts: [{ fill: "#ee3355" }] },
  });
  expect(layers[1]!.x).toBe(layers[0]!.x + 16);
  expect(snapshot.selection).toEqual(layers.map((layer) => layer.id));
  expect(snapshot.project.assets).toEqual(original.assets);
  expect(snapshot.revision).toBe(1);
  d.engine.undo();
  expect(d.engine.getSnapshot().project).toEqual(original);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});
test("bounds inputs and preserves the entire document if a later file is invalid or unreadable", async () => {
  const d = setup(),
    before = d.engine.getSnapshot();
  await importVectorFiles(d.engine, []);
  await expect(
    importVectorFiles(
      d.engine,
      Array.from({ length: 33 }, () => file()),
    ),
  ).rejects.toMatchObject({ code: "tooMany", name: "VectorImportError" });
  const large = new File([new Uint8Array(256001)], "large.svg");
  await expect(importVectorFiles(d.engine, [large])).rejects.toMatchObject({
    code: "tooLarge",
    fileName: "large.svg",
  });
  await expect(
    importVectorFiles(d.engine, [file(), file("bad.svg", async () => "<script/>")]),
  ).rejects.toMatchObject({ code: "invalid", fileName: "bad.svg" });
  const cause = new Error("disk failure");
  await expect(
    importVectorFiles(d.engine, [file("read.svg", () => Promise.reject(cause))]),
  ).rejects.toMatchObject({ code: "read", cause });
  expect(d.engine.getSnapshot()).toBe(before);
  expect(new VectorImportError("stale").message).toBe("Vector import failed: stale.");
});
test.each(["project", "page", "revision"] as const)(
  "rejects delayed results after the %s destination changes",
  async (change) => {
    const d = setup();
    let finish!: (value: string) => void;
    const pending = importVectorFiles(d.engine, [
      file(
        "pending.svg",
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      ),
    ]);
    if (change === "project") d.engine.load(createProject());
    if (change === "page") d.engine.execute({ type: "addPage", page: createPage() });
    if (change === "revision") d.engine.execute({ type: "renameProject", name: "Changed" });
    const changed = d.engine.getSnapshot();
    finish(source);
    await expect(pending).rejects.toMatchObject({ code: "stale" });
    expect(d.engine.getSnapshot()).toBe(changed);
  },
);
