import { expect, it } from "vitest";
import { validateProjectWrite } from "../../../../src/services/projects/persistence/validate";
import type { ProjectWriteFrame } from "../../../../src/services/projects/persistence/model";
import { prepared } from "./fixtures";
it("rejects corrupt/incomplete metadata before any transaction can persist it", () => {
  const { frame } = prepared();
  expect(() => validateProjectWrite(frame)).not.toThrow();
  for (const patch of [
    { expectedRevision: 3 },
    { remember: undefined },
    { originals: [] },
    { basis: 3 },
    { pageRevisions: {} },
    { pagePayloads: [-1] },
    { descriptions: [{ ...frame.descriptions[0], dataUrl: "forbidden" }] },
    { originals: [{ ...frame.originals[0], projectId: "foreign" }] },
    { descriptions: [...frame.descriptions, ...frame.descriptions] },
  ])
    expect(() => validateProjectWrite({ ...frame, ...patch } as typeof frame)).toThrow();
});
it("accepts a delta only with an explicit asset basis and requires full originals otherwise", () => {
  const { frame } = prepared(),
    delta = { ...frame, originals: [], basis: "assets:before" };
  expect(() => validateProjectWrite(delta)).not.toThrow();
  expect(() =>
    validateProjectWrite({ ...delta, basis: undefined } as unknown as ProjectWriteFrame),
  ).toThrow("Missing captured originals.");
  expect(() => validateProjectWrite({ ...frame, pagePayloads: [2] })).not.toThrow();
});
it("rejects malformed transport headers and invalid document envelopes", () => {
  const { frame } = prepared();
  const invalid: unknown[] = [
    null,
    {},
    { ...frame, document: null },
    { ...frame, document: { ...frame.document, id: "" } },
    { ...frame, document: { ...frame.document, id: 1 } },
    { ...frame, document: { ...frame.document, assets: {} } },
    { ...frame, document: { ...frame.document, pages: [] } },
    { ...frame, descriptions: null },
    { ...frame, originals: null },
    { ...frame, requireAbsent: "false" },
    { ...frame, pageRevisions: null },
  ];
  for (const value of invalid)
    expect(() => validateProjectWrite(value as ProjectWriteFrame)).toThrow(
      "Invalid project persistence frame.",
    );
});
it("rejects duplicate, foreign and incomplete originals without accepting a partial full snapshot", () => {
  const { frame } = prepared(),
    original = frame.originals[0]!,
    description = frame.descriptions[0]!;
  for (const descriptions of [
    [null],
    [{ ...description, id: "" }],
    [{ ...description, id: 3 }],
    [description, description],
    [{ ...description, dataUrl: undefined }],
  ])
    expect(() =>
      validateProjectWrite({ ...frame, descriptions } as unknown as ProjectWriteFrame),
    ).toThrow("Invalid original metadata.");
  for (const originals of [
    [null],
    [original, original],
    [{ ...original, assetId: "missing" }],
    [{ ...original, projectId: "other" }],
    [{ ...original, dataUrl: 3 }],
    [{ ...original, dataUrl: "https://example.test/not-captured.png" }],
  ])
    expect(() =>
      validateProjectWrite({ ...frame, originals } as unknown as ProjectWriteFrame),
    ).toThrow("Invalid captured original.");
  expect(() => validateProjectWrite({ ...frame, originals: [] })).toThrow(
    "Missing captured originals.",
  );
});
it("requires every page pixel revision and complete finite integer byte accounting", () => {
  const { frame } = prepared();
  for (const document of [
    { ...frame.document, pages: [null] },
    { ...frame.document, pages: [{ id: 3 }] },
    { ...frame.document, pages: [{ id: "missing" }] },
  ])
    expect(() =>
      validateProjectWrite({ ...frame, document } as unknown as ProjectWriteFrame),
    ).toThrow("Missing page revision.");
  for (const pageRevisions of [{ page: "" }, { page: 3 }])
    expect(() =>
      validateProjectWrite({ ...frame, pageRevisions } as unknown as ProjectWriteFrame),
    ).toThrow("Missing page revision.");
  for (const pagePayloads of [[], [1], [1.5], [NaN], [Infinity], [2, 3]])
    expect(() => validateProjectWrite({ ...frame, pagePayloads })).toThrow(
      "Invalid page accounting.",
    );
});
