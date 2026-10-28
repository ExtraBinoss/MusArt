import { expect, it } from "vitest";
import { fiberTimerCompatibility } from "../../../scripts/vite/fiber-timer";
it("redirects only R3F's own bare Three import in dev optimization and production resolution", () => {
  const adapter = "/project/apps/web/src/canvas/render/fiber-three.ts";
  const plugin = fiberTimerCompatibility(adapter),
    handler = plugin.resolveId;
  if (typeof handler !== "function") throw new Error("Expected a resolver hook");
  const resolve = (source: string, importer?: string) =>
    Reflect.apply(handler, {}, [source, importer, {}]);
  expect(plugin.enforce).toBe("pre");
  expect(resolve("three", "/project/node_modules/@react-three/fiber/dist/events.js")).toBe(adapter);
  expect(resolve("three", "C:\\project\\node_modules\\@react-three\\fiber\\dist\\events.js")).toBe(
    adapter,
  );
  expect(
    resolve("three/webgpu", "/project/node_modules/@react-three/fiber/dist/events.js"),
  ).toBeNull();
  expect(resolve("three", "/project/apps/web/src/canvas/render/fiber-three.ts")).toBeNull();
  expect(resolve("three", "/project/node_modules/@react-three/fiber-helper/index.js")).toBeNull();
  expect(resolve("three")).toBeNull();
});
