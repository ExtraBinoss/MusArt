import { expect, test, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import {
  getTransitionRequests,
  requestLayerTransition,
} from "../../../../src/components/motion/transitions/requests";
import { getMotionConfirmation } from "../../../../src/state/session/motion-confirmation";
function fixture(count = 1) {
  const layers = Array.from({ length: count }, (_, i) =>
    createLayer("rectangle", { id: "layer-" + i }),
  );
  const engine = new EditorEngine(createProject({ pages: [createPage({ id: "page", layers })] }));
  const port = getTransitionRequests(engine),
    changed = vi.fn(),
    stop = port.subscribe(changed);
  return { engine, layers, port, changed, stop };
}
test("a direct Static action converts small compositions and opens one exact scoped request", async () => {
  const d = fixture(),
    selection = d.engine.getSnapshot().selection;
  expect(await requestLayerTransition(d.engine, "page", "layer-0", { x: 300, y: 80 })).toBe(true);
  expect(d.engine.getSnapshot().project.pages[0]!.motion?.mode).toBe("motion");
  expect(d.port.read()).toMatchObject({
    origin: {
      project: d.engine.getSnapshot().project,
      revision: d.engine.getSnapshot().revision,
      compositionId: "page",
      layerId: "layer-0",
    },
    point: { x: 300, y: 80 },
  });
  expect(d.engine.getSnapshot().selection).toBe(selection);
  d.stop();
  expect(d.port.read()).toBeNull();
});
test("the real >3 confirmation broker leaves cancellation canonical and accepts conversion explicitly", async () => {
  const d = fixture(4),
    broker = getMotionConfirmation(d.engine),
    detach = broker.attachHost(),
    before = d.engine.getSnapshot();
  const cancelled = requestLayerTransition(d.engine, "page", "layer-0");
  expect(broker.read()!.layerIds).toHaveLength(4);
  broker.respond(broker.read()!, false);
  expect(await cancelled).toBe(false);
  expect(d.engine.getSnapshot()).toBe(before);
  expect(d.port.read()).toBeNull();
  const accepted = requestLayerTransition(d.engine, "page", "layer-0");
  broker.respond(broker.read()!, true);
  expect(await accepted).toBe(true);
  expect(d.engine.getSnapshot().project.pages[0]!.motion?.mode).toBe("motion");
  detach();
  d.stop();
});
test("same-ID replacement during confirmation cannot adopt the accepted plan or open the replacement", async () => {
  const d = fixture(4),
    broker = getMotionConfirmation(d.engine),
    detach = broker.attachHost();
  const pending = requestLayerTransition(d.engine, "page", "layer-0"),
    plan = broker.read()!;
  d.engine.load(structuredClone(d.engine.getSnapshot().project));
  broker.respond(plan, true);
  expect(await pending).toBe(false);
  expect(d.engine.getSnapshot().project.pages[0]!.motion).toBeUndefined();
  expect(d.port.read()).toBeNull();
  detach();
  d.stop();
});
test("new requests replace the lease, stale cleanup cannot close them, and edits release captured documents", async () => {
  const d = fixture(2);
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  await requestLayerTransition(d.engine, "page", "layer-0");
  const old = d.port.read()!;
  await requestLayerTransition(d.engine, "page", "layer-1");
  d.port.clear(old.token);
  expect(d.port.read()?.origin.layerId).toBe("layer-1");
  d.engine.execute({ type: "renameProject", name: "Changed" });
  expect(d.port.read()).toBeNull();
  d.stop();
});
test("locked/missing targets and unavailable confirmation never edit a document", async () => {
  const d = fixture();
  d.engine.execute({ type: "updateLayers", ids: ["layer-0"], patch: { locked: true } });
  const before = d.engine.getSnapshot();
  expect(await requestLayerTransition(d.engine, "page", "layer-0")).toBe(false);
  expect(await requestLayerTransition(d.engine, "page", "deleted")).toBe(false);
  expect(d.engine.getSnapshot()).toBe(before);
  d.stop();
  const many = fixture(4);
  await expect(requestLayerTransition(many.engine, "page", "layer-0")).rejects.toMatchObject({
    code: "unavailable",
  });
  expect(many.engine.getSnapshot().project.pages[0]!.motion).toBeUndefined();
  many.stop();
});

test("uses an explicit clip, resolves the playhead, and requires a chooser for repeated-layer gaps", async () => {
  const d = fixture();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const id = d.engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!.id;
  d.engine.execute({
    type: "duplicateMotionOccurrence",
    trackId: id,
    start: { value: 3, rate: 1 },
  });
  const copy = d.engine.getSnapshot().project.pages[0]!.motion!.tracks[1]!;
  const { createMotionTransport } = await import("../../../../src/services/motion/transport");
  const transport = createMotionTransport(d.engine);
  transport.seek({ value: 7, rate: 2 });
  expect(await requestLayerTransition(d.engine, "page", "layer-0")).toBe(true);
  expect(d.port.read()!.origin.trackId).toBe(copy.id);
  expect(d.port.read()!.choices).toBeUndefined();
  transport.seek({ value: 5, rate: 2 });
  const before = d.engine.getSnapshot();
  expect(await requestLayerTransition(d.engine, "page", "layer-0")).toBe(true);
  const choice = d.port.read()!;
  expect(choice.choices).toHaveLength(2);
  expect(d.port.select(choice.token, copy.id)).toBe(true);
  expect(d.port.read()!.origin.trackId).toBe(copy.id);
  expect(d.port.read()!.choices).toBeUndefined();
  expect(d.engine.getSnapshot()).toBe(before);
  expect(await requestLayerTransition(d.engine, "page", "layer-0", undefined, id)).toBe(true);
  expect(d.port.read()!.origin.trackId).toBe(id);
  expect(d.port.select(choice.token, copy.id)).toBe(false);
  expect(await requestLayerTransition(d.engine, "page", "layer-0", undefined, "missing")).toBe(
    false,
  );
  d.stop();
});
test("publishes after the originating menu closes and cancels a retired pending focus handoff", async () => {
  vi.useFakeTimers();
  try {
    const d = fixture();
    d.engine.execute({ type: "setCompositionMode", mode: "motion" });
    const pending = requestLayerTransition(d.engine, "page", "layer-0");
    expect(d.port.read()).toBeNull();
    await vi.runAllTimersAsync();
    expect(await pending).toBe(true);
    d.port.clear();
    const retired = requestLayerTransition(d.engine, "page", "layer-0");
    d.stop();
    expect(await retired).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(d.port.read()).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});
