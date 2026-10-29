import { expect, test } from "vitest";
import { createLayer, createPage, createProject, stateFromProject } from "@musart/core";
import {
  computeCanonicalHash,
  thumbnailPaintMetadata,
} from "../../../../src/services/serialization/hashing/compute";
import { fingerprintState } from "../../../../src/services/history/fingerprint";
import { canonicalJson } from "../../../../src/services/serialization/canonical-json";

test("worker history hashing preserves the existing canonical SHA and omits original bytes", async () => {
  const project = createProject();
  project.assets.a = {
    id: "a",
    name: "Original",
    mime: "image/png",
    width: 1,
    height: 1,
    dataUrl: "large-original-data",
  };
  const state = stateFromProject(project);
  expect(JSON.stringify(state)).not.toContain("large-original-data");
  expect(await computeCanonicalHash({ kind: "history", state })).toBe(
    await fingerprintState(state),
  );
});

test("thumbnail metadata and digest retain the exact portable paint schema", async () => {
  const layer = createLayer("vector", {
    vector: { path: "M0 0h4v4z", viewBox: "0 0 4 4", attribution: "credit" },
    guides: [],
    margin: { top: 1, right: 2, bottom: 3, left: 4 },
  });
  const page = createPage({ layers: [layer] });
  const job = { kind: "thumbnail" as const, page, sources: [["a", "digest"]] as const };
  const {
    name: _name,
    locked: _locked,
    guides: _guides,
    margin: _margin,
    padding: _padding,
    ...paint
  } = layer;
  const expected = {
    version: "gpu-webp-768-88-v4",
    width: page.width,
    height: page.height,
    background: page.background,
    colorSpace: "srgb",
    layers: [{ ...paint, effects: [], vector: { ...layer.vector, attribution: undefined } }],
    sources: job.sources,
  };
  expect(thumbnailPaintMetadata(job)).toEqual(expected);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalJson(expected)),
  );
  expect(await computeCanonicalHash(job)).toBe(
    [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
  );
  for (const version of ["gpu-webp-768-88-v1", "gpu-webp-768-88-v2"]) {
    const previous = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(canonicalJson({ ...expected, version })),
    );
    expect(await computeCanonicalHash(job)).not.toBe(
      [...new Uint8Array(previous)].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
    );
  }
  expect(await computeCanonicalHash({ ...job, page: { ...page, background: "#ff0000" } })).not.toBe(
    await computeCanonicalHash(job),
  );
});
