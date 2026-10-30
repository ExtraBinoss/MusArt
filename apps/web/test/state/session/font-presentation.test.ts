import { expect, test, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { getFontPresentation } from "../../../src/state/session/font-presentation";

function fixture() {
  const layer = createLayer("text", { fontFamily: "Arial", fontWeight: 700 });
  const page = createPage({ layers: [layer] });
  const engine = new EditorEngine(createProject({ pages: [page] }));
  const port = getFontPresentation(engine);
  const input = { fontId: "arimo", layerId: layer.id, family: "Arimo", weight: 700 };
  const projected = () => ({ ...page, layers: [{ ...layer, fontFamily: "Arimo" }] });
  const origin = () => ({
    projectId: engine.getSnapshot().project.id,
    revision: engine.getSnapshot().revision,
  });
  return { engine, layer, page, port, input, projected, origin };
}
test("only a renderer owning the matching logical font ticket can announce ready", () => {
  const d = fixture(),
    publisher = d.port.acquire(),
    other = d.port.acquire();
  expect(getFontPresentation(d.engine)).toBe(d.port);
  const ticket = d.port.request(d.input);
  expect(d.port.read()).toMatchObject({ status: "pending", ticket, available: true });
  expect(publisher.capture(d.page, d.origin())).toBeUndefined();
  expect(publisher.capture(d.projected(), d.origin())).toBe(ticket);
  expect(d.port.read().status).toBe("pending");
  other.present(ticket);
  expect(d.port.read().status).toBe("pending");
  publisher.present(ticket);
  expect(d.port.read().status).toBe("ready");
  d.port.cancel(ticket);
  publisher.release();
  other.release();
});
test("same family requested again has a new generation and rejects old draws and failures", () => {
  const d = fixture(),
    publisher = d.port.acquire(),
    changed = vi.fn();
  const stop = d.port.subscribe(changed);
  const first = d.port.request(d.input);
  publisher.capture(d.projected(), d.origin());
  const next = d.port.request(d.input);
  expect(next.sequence).toBeGreaterThan(first.sequence);
  publisher.present(first);
  publisher.fail(first, new Error("retired"));
  d.port.cancel(first);
  expect(d.port.read()).toMatchObject({ status: "pending", ticket: next });
  expect(publisher.capture(d.projected(), d.origin())).toBe(next);
  publisher.present(next);
  const calls = changed.mock.calls.length;
  publisher.present(next);
  expect(changed).toHaveBeenCalledTimes(calls);
  stop();
  d.port.cancel(next);
  publisher.release();
  expect(changed).toHaveBeenCalledTimes(calls);
});
test("missing or non-text targets remain unavailable without waiting for an impossible draw", () => {
  const d = fixture(),
    publisher = d.port.acquire();
  const missing = d.port.request({ ...d.input, layerId: "retired-layer" });
  expect(d.port.read()).toMatchObject({ status: "unavailable", ticket: missing });
  expect(
    publisher.capture(
      { ...d.projected(), layers: [{ ...d.layer, id: "retired-layer", fontFamily: "Arimo" }] },
      d.origin(),
    ),
  ).toBeUndefined();
  publisher.present(missing);
  expect(d.port.read().status).toBe("unavailable");
  const rectangle = createLayer("rectangle");
  d.engine.execute({ type: "addLayers", layers: [rectangle] });
  const wrong = d.port.request({ ...d.input, layerId: rectangle.id });
  expect(d.port.read()).toMatchObject({ status: "unavailable", ticket: wrong });
  d.port.cancel(wrong);
  publisher.release();
});
test.each(["project", "revision", "page"] as const)(
  "changed %s retires its pending request",
  (kind) => {
    const d = fixture(),
      publisher = d.port.acquire(),
      ticket = d.port.request(d.input);
    publisher.capture(d.projected(), d.origin());
    if (kind === "project") d.engine.load(createProject());
    else if (kind === "revision")
      d.engine.execute({ type: "updatePage", patch: { name: "Changed" } });
    else d.engine.execute({ type: "addPage", page: createPage() });
    publisher.present(ticket);
    expect(d.port.read()).toMatchObject({ status: "idle", ticket: null });
    publisher.release();
  },
);
test("availability, actual errors, hidden targets and disposal never report successful rendering", () => {
  const d = fixture(),
    ticket = d.port.request(d.input);
  expect(d.port.read()).toMatchObject({ available: false, status: "unavailable" });
  const publisher = d.port.acquire();
  expect(d.port.read().status).toBe("pending");
  expect(publisher.capture({ ...d.projected(), id: "other" }, d.origin())).toBeUndefined();
  expect(publisher.capture(d.projected(), { ...d.origin(), revision: 99 })).toBeUndefined();
  const hidden = d.projected();
  hidden.layers[0]!.visible = false;
  expect(publisher.capture(hidden, d.origin())).toBeUndefined();
  expect(d.port.read().status).toBe("unavailable");
  const group = createLayer("group", { opacity: 0 });
  const grouped = d.projected();
  grouped.layers[0]!.parentId = group.id;
  grouped.layers.unshift(group);
  expect(publisher.capture(grouped, d.origin())).toBeUndefined();
  expect(d.port.read().status).toBe("unavailable");
  publisher.capture(d.projected(), d.origin());
  const other = d.port.acquire();
  other.capture(d.projected(), d.origin());
  publisher.fail(ticket, new Error("Font parsing failed"));
  expect(d.port.read()).toMatchObject({ status: "error", message: "Font parsing failed" });
  publisher.present(ticket);
  other.present(ticket);
  expect(d.port.read().status).toBe("error");
  other.release();
  expect(publisher.capture(d.projected(), d.origin())).toBeUndefined();
  const retry = d.port.request(d.input);
  publisher.capture(d.projected(), d.origin());
  publisher.present(retry);
  expect(d.port.read().status).toBe("ready");
  publisher.unavailable();
  publisher.unavailable();
  publisher.release();
  publisher.release();
  expect(d.port.read()).toMatchObject({ status: "unavailable", available: false });
  expect(publisher.capture(d.projected(), d.origin())).toBeUndefined();
  publisher.present(ticket);
  publisher.fail(ticket, "retired");
  expect(d.port.read().status).toBe("unavailable");
  d.port.cancel(retry);
  expect(d.port.read()).toMatchObject({ status: "idle", ticket: null });
});
