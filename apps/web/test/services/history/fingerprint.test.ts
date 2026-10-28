import { expect, it } from "vitest";
import { createLayer, createPage, createProject, stateFromProject } from "@musart/core";
import { fingerprintState } from "../../../src/services/history/fingerprint";
import { projectAt } from "./fixtures";
it("hashes all portable metadata deterministically, independent of object key order", async () => {
  const state = stateFromProject(projectAt());
  const hash = await fingerprintState(state);
  expect(hash).toMatch(/^[a-f0-9]{64}$/);
  expect(
    await fingerprintState(Object.fromEntries(Object.entries(state).reverse()) as typeof state),
  ).toBe(hash);
  expect(await fingerprintState(stateFromProject(projectAt(1)))).not.toBe(hash);
  const project = projectAt();
  project.assets.original = {
    id: "original",
    name: "Photo",
    width: 2,
    height: 1,
    mime: "image/png",
    dataUrl: "data:image/png;base64,first",
  };
  const first = await fingerprintState(stateFromProject(project));
  project.assets.original.dataUrl = "data:image/png;base64,second";
  expect(await fingerprintState(stateFromProject(project))).toBe(first);
});

it("preserves the original canonical SHA-256 bytes while reusing repeated object layouts", async () => {
  const layer = createLayer("rectangle");
  const state = stateFromProject(
    createProject({
      pages: [
        createPage({
          layers: Array.from({ length: 500 }, (_, i) => ({ ...layer, id: `layer-${i}`, x: i })),
        }),
      ],
    }),
  );
  const serialized = JSON.stringify(state, (_key, value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")))
      : value,
  );
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized));
  const expected = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  expect(await fingerprintState(state)).toBe(expected);
  const extra = JSON.parse('{"__proto__":{"polluted":true},"constructor":"data"}') as object;
  const extended = { ...state, extra };
  expect(await fingerprintState(extended)).toMatch(/^[a-f0-9]{64}$/);
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
});
