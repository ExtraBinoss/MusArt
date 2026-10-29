import { expect, it } from "vitest";
import { EditorEngine } from "@musart/core";
import {
  prepareProjectWrite,
  withFullOriginals,
} from "../../../../src/services/projects/persistence/prepare";
import { project } from "./fixtures";
import { THUMBNAIL_RENDER_VERSION } from "../../../../src/services/projects/thumbnails/model";
it("captures only changed originals while preserving the full document and exact hash/accounting metadata", () => {
  const input = project(),
    basis = {
      projectId: input.id,
      revision: "assets:1",
      urls: new Map([["photo", input.assets.photo!.dataUrl!]]),
    };
  const value = prepareProjectWrite(
    input,
    { page: "pixels" },
    [10],
    { expectedRevision: "before", remember: false, requireAbsent: true },
    "preview",
    basis,
  );
  expect(value.frame).toMatchObject({
    thumbnailRenderVersion: THUMBNAIL_RENDER_VERSION,
    basis: "assets:1",
    expectedRevision: "before",
    remember: false,
    requireAbsent: true,
    pagePayloads: [10],
    thumbnail: "preview",
    originals: [],
  });
  expect(value.frame.document).not.toHaveProperty("assets");
  expect(value.frame.descriptions[0]).not.toHaveProperty("dataUrl");
  expect(value.urls.get("photo")).toBe(input.assets.photo!.dataUrl!);
  expect(withFullOriginals(value.frame, input)).not.toHaveProperty("basis");
  expect(withFullOriginals(value.frame, input).originals).toHaveLength(1);
  input.assets.photo!.dataUrl! = "data:image/png;base64,BBBB";
  expect(
    prepareProjectWrite(
      input,
      { page: "pixels" },
      [undefined],
      { expectedRevision: "before" },
      undefined,
      basis,
    ).frame,
  ).toMatchObject({ originals: [{ dataUrl: input.assets.photo!.dataUrl! }] });
  expect(
    prepareProjectWrite(
      input,
      { page: "pixels" },
      [undefined],
      { expectedRevision: "" },
      undefined,
      { ...basis, projectId: "other" },
    ).frame,
  ).not.toHaveProperty("basis");
  expect(
    prepareProjectWrite(input, { page: "pixels" }, [undefined], { expectedRevision: "" }).frame,
  ).not.toHaveProperty("pagePayloads");
});
it("captures full original strings once while reusing certified immutable document pages", () => {
  const input = new EditorEngine(project()).getSnapshot().project,
    value = prepareProjectWrite(input, { page: "pixels" }, [10], { expectedRevision: "before" });
  expect(value.frame.document.pages).toBe(input.pages);
  expect(value.frame).toMatchObject({
    remember: true,
    requireAbsent: false,
    expectedRevision: "before",
    originals: [{ projectId: "project", assetId: "photo", dataUrl: input.assets.photo!.dataUrl! }],
  });
  expect(value.frame).not.toHaveProperty("basis");
  expect(value.frame).not.toHaveProperty("thumbnail");
  expect(value.frame.descriptions).toEqual([
    { id: "photo", name: "Photo", mime: "image/png", width: 1, height: 1 },
  ]);
  expect(input.assets.photo).toHaveProperty("dataUrl");
});
it("keeps a complete current asset manifest while transmitting only changed and new originals", () => {
  const input = project(),
    previousUrl = input.assets.photo!.dataUrl!,
    basis = {
      projectId: input.id,
      revision: "assets:before",
      urls: new Map([
        ["photo", previousUrl],
        ["removed", "data:image/png;base64,REMOVED"],
      ]),
    };
  input.assets.photo!.dataUrl! = "data:image/png;base64,CHANGED";
  input.assets.new = { ...input.assets.photo!, id: "new", name: "New" };
  const value = prepareProjectWrite(
    input,
    { page: "pixels" },
    [10],
    { expectedRevision: "captured", requireAbsent: true, remember: false },
    "preview",
    basis,
  );
  expect(value.frame.descriptions.map(({ id }) => id)).toEqual(["photo", "new"]);
  expect(value.frame.originals.map(({ assetId }) => assetId)).toEqual(["photo", "new"]);
  expect([...value.urls]).toEqual([
    ["photo", "data:image/png;base64,CHANGED"],
    ["new", "data:image/png;base64,CHANGED"],
  ]);
  expect(basis.urls.get("photo")).toBe(previousUrl);
  expect(value.urls.has("removed")).toBe(false);
  const full = withFullOriginals(value.frame, input);
  expect(full).toMatchObject({
    expectedRevision: "captured",
    requireAbsent: true,
    remember: false,
    thumbnail: "preview",
    pageRevisions: { page: "pixels" },
    pagePayloads: [10],
  });
  expect(full).not.toHaveProperty("basis");
  expect(value.frame.basis).toBe("assets:before");
  expect(full.originals).toEqual(value.frame.originals);
});
it("omits incomplete or wrong-length accounting instead of publishing partial page byte totals", () => {
  const input = project();
  for (const sizes of [[], [undefined], [10, 20]])
    expect(
      prepareProjectWrite(input, { page: "pixels" }, sizes, { expectedRevision: "" }).frame,
    ).not.toHaveProperty("pagePayloads");
});
