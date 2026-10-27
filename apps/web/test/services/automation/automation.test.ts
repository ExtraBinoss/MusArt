import { afterEach, describe, expect, it, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import type { EditorServices } from "../../../src/state/contracts";
import { attachAutomation } from "../../../src/services/automation/automation";
const render = vi.hoisted(() => ({ renderComposition: vi.fn(), exportComposition: vi.fn() }));
vi.mock("@musart/render", () => render);
afterEach(() => {
  delete window.musart;
});
function services() {
  return { saveProject: vi.fn(async () => {}) } as unknown as EditorServices;
}
describe("opt-in headless automation port", () => {
  it("uses the same commands, history, selection and page session as the UI", async () => {
    const engine = new EditorEngine();
    const platform = services();
    const detach = attachAutomation(engine, platform);
    const api = window.musart!;
    const layer = createLayer("rectangle");
    api.execute({ type: "addLayers", layers: [layer] });
    api.select([layer.id]);
    expect(api.snapshot().selection).toEqual([layer.id]);
    const copy = api.snapshot();
    copy.project.name = "Tamper";
    expect(engine.getSnapshot().project.name).not.toBe("Tamper");
    api.transaction([
      { type: "updateLayers", ids: [layer.id], patch: { x: 20 } },
      { type: "updateLayers", ids: [layer.id], patch: { y: 30 } },
    ]);
    expect(api.snapshot().project.pages[0]!.layers[0]).toMatchObject({ x: 20, y: 30 });
    api.undo();
    expect(api.snapshot().project.pages[0]!.layers[0]?.x).toBe(80);
    api.redo();
    expect(api.snapshot().project.pages[0]!.layers[0]?.x).toBe(20);
    const page = createPage();
    api.execute({ type: "addPage", page });
    api.page(engine.getSnapshot().project.pages[0]!.id);
    expect(api.snapshot().pageId).not.toBe(page.id);
    const loaded = createProject({ name: "Loaded by CLI" });
    api.load(loaded);
    expect(api.snapshot().project.name).toBe("Loaded by CLI");
    await api.save();
    expect(platform.saveProject).toHaveBeenCalledTimes(1);
    detach();
    expect(window.musart).toBeUndefined();
  });
  it("renders the active composition through the shared export pipeline and explicit WebGL fallback", async () => {
    const engine = new EditorEngine();
    const detach = attachAutomation(engine, services());
    const api = window.musart!;
    const page = engine.getSnapshot().project.pages[0]!;
    render.exportComposition.mockResolvedValue(new Blob(["pixels"], { type: "image/png" }));
    expect(await api.render()).toBe("data:image/png;base64,cGl4ZWxz");
    expect(render.exportComposition).toHaveBeenCalledWith(page, {}, {});
    const toDataURL = vi.fn((mime: string) => `data:${mime};base64,gpu`);
    render.renderComposition.mockResolvedValue({ toDataURL });
    expect(await api.render({ forceWebGL: true, scale: 2, format: "webp" })).toBe(
      "data:image/webp;base64,gpu",
    );
    expect(render.renderComposition).toHaveBeenCalledWith(page, {}, { scale: 2, forceWebGL: true });
    expect(await api.render({ forceWebGL: true })).toBe("data:image/png;base64,gpu");
    detach();
  });
  it("detaches only its own installed API, leaving a newer session attached", () => {
    const engine = new EditorEngine();
    const first = attachAutomation(engine, services());
    const second = attachAutomation(engine, services());
    first();
    expect(window.musart).toBeDefined();
    second();
    expect(window.musart).toBeUndefined();
  });
});
