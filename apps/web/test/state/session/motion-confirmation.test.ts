import { expect, test, vi } from "vitest";
import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  planMotionInitialization,
} from "@musart/core";
import {
  getMotionConfirmation,
  MotionConfirmationError,
} from "../../../src/state/session/motion-confirmation";

function fixture(count = 4) {
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          id: "page",
          layers: Array.from({ length: count }, (_, index) =>
            createLayer("rectangle", { id: `layer-${index}` }),
          ),
        }),
        createPage({ id: "second" }),
      ],
    }),
  );
  return {
    engine,
    port: getMotionConfirmation(engine),
    plan: planMotionInitialization(engine.getSnapshot()),
  };
}

test("bounds one pending request, captures the staged count immutably and resolves explicit answers without document edits", async () => {
  const { engine, port, plan } = fixture();
  const stop = port.attachHost(),
    changed = vi.fn(),
    unsubscribe = port.subscribe(changed);
  expect(getMotionConfirmation(engine)).toBe(port);
  expect(port.read()).toBeNull();
  const before = engine.getSnapshot();
  // Include incoming staged video: it deliberately is not in the canonical graph yet.
  plan.layerIds.push("incoming-video");
  const result = port.request(plan);
  const token = port.read()!;
  expect(port.readReason()).toBe("import");
  plan.layerIds.push("later-mutation");
  expect(token.layerIds).toHaveLength(5);
  expect(Object.isFrozen(token.layerIds)).toBe(true);
  await expect(port.request(plan)).rejects.toMatchObject({ code: "busy" });
  expect(port.respond({ ...token }, true)).toBe(false);
  expect(port.respond(token, true)).toBe(true);
  await expect(result).resolves.toBe(true);
  expect(port.read()).toBeNull();
  expect(port.readReason()).toBeNull();
  expect(engine.getSnapshot()).toBe(before);
  expect(changed).toHaveBeenCalledTimes(2);
  expect(port.respond(token, false)).toBe(false);
  unsubscribe();
  stop();
  stop();
});

test("never leaves an invisible request hanging and directly permits the three-item boundary", async () => {
  const small = fixture(3);
  await expect(small.port.request(small.plan)).resolves.toBe(true);
  expect(small.port.read()).toBeNull();
  const { port, plan } = fixture();
  await expect(port.request(plan)).rejects.toMatchObject({ code: "unavailable" });
  const stop = port.attachHost();
  const result = port.request(plan);
  stop();
  await expect(result).resolves.toBe(false);
  const host = port.attachHost(),
    another = port.request(plan);
  port.cancel();
  await expect(another).resolves.toBe(false);
  host();
});

test("rejects stale project/page/revision or reset, cleans the engine listener and never reuses old answer tokens", async () => {
  for (const change of [
    (engine: EditorEngine) => engine.execute({ type: "renameProject", name: "Changed" }),
    (engine: EditorEngine) => engine.setPage("second"),
    (engine: EditorEngine) => engine.load(createProject()),
  ]) {
    const { engine, port, plan } = fixture();
    const observe = engine.subscribe,
      released = vi.fn();
    const subscribe = vi.spyOn(engine, "subscribe").mockImplementation((listener) => {
        const detach = observe(listener);
        return () => {
          released();
          detach();
        };
      }),
      stop = port.attachHost();
    const result = port.request(plan);
    const rejected = expect(result).rejects.toMatchObject({ code: "stale" });
    change(engine);
    await rejected;
    expect(port.read()).toBeNull();
    expect(subscribe).toHaveBeenCalledOnce();
    expect(released).toHaveBeenCalledOnce();
    await expect(port.request(plan)).rejects.toMatchObject({ code: "stale" });
    stop();
  }
});

test("ignores selection-only changes and validates malformed plans before requesting a decision", async () => {
  const { engine, port, plan } = fixture(),
    stop = port.attachHost();
  for (const patch of [
    { revision: -1 },
    { layerIds: ["x", "x"] },
    { requiresConfirmation: false },
    { duration: { value: 0, rate: 1 } },
    { frameRate: { numerator: 0, denominator: 1 } },
  ])
    await expect(port.request({ ...plan, ...patch })).rejects.toBeInstanceOf(
      MotionConfirmationError,
    );
  const result = port.request(plan);
  engine.select(["layer-0"]);
  expect(port.read()).not.toBeNull();
  port.respond(port.read()!, false);
  await expect(result).resolves.toBe(false);
  expect(getMotionConfirmation(new EditorEngine())).not.toBe(port);
  stop();
});
