import { expect, it } from "vitest";
import { validateAssetDescription } from "../../src/assets/validation";
import { validateProject } from "../../src/document/validation";
import { createLayer, createPage, createProject } from "../../src/document/factories";
import { image, video, audio } from "./fixtures";
it("validates small video metadata while excluding native binary and data URL payloads", () => {
  expect(() => validateAssetDescription({ ...video() })).not.toThrow();
  expect(() => validateAssetDescription({ ...image() })).not.toThrow();
  for (const patch of [
    { dataUrl: "data:video/mp4;base64,AAAA" },
    { blob: {} },
    { byteLength: 0 },
    { contentRevision: "" },
    { originalId: "" },
    { duration: { value: 0, rate: 1 } },
    { firstTimestamp: { value: 0.5, rate: 1 } },
    { timeResolution: 0 },
    { mime: "image/png" },
    {
      orientation: {
        rotation: 45,
        flip: false,
        pixelAspectRatio: { numerator: 1, denominator: 1 },
      },
    },
    {
      orientation: { rotation: 0, flip: false, pixelAspectRatio: { numerator: 1, denominator: 0 } },
    },
  ])
    expect(() => validateAssetDescription({ ...video(), ...patch })).toThrow();
  expect(() => validateAssetDescription({ ...image(), kind: "audio" })).toThrow();
  expect(() =>
    validateAssetDescription({ ...image(), dataUrl: "https://example.test/photo.png" }),
  ).toThrow();
});
it("requires image and video layers to bind to the matching asset kind", () => {
  const asset = video(),
    layer = createLayer("video", { id: "clip", assetId: asset.id });
  const project = createProject({
    assets: { [asset.id]: asset },
    pages: [createPage({ layers: [layer] })],
  });
  expect(() => validateProject(project)).not.toThrow();
  layer.kind = "image";
  expect(() => validateProject(project)).toThrow();
  layer.kind = "video";
  project.assets[asset.id] = { ...image(), id: asset.id };
  expect(() => validateProject(project)).toThrow();
});

it("binds timed video masks through a layer interval rather than an untimed original asset", () => {
  const asset = video(),
    clip = createLayer("video", { id: "clip-mask", assetId: asset.id, maskSource: true });
  const owner = createLayer("rectangle", {
    id: "owner",
    mask: { assetId: asset.id, enabled: true, inverted: false },
  });
  const project = createProject({
    assets: { [asset.id]: asset },
    pages: [createPage({ layers: [owner, clip] })],
  });
  expect(() => validateProject(project)).toThrow("mask asset must be an image");
  owner.mask = { layerId: clip.id, enabled: true, inverted: false };
  expect(() => validateProject(project)).not.toThrow();
});

it("keeps standalone audio nonvisual and validates immutable original metadata", () => {
  expect(() => validateAssetDescription({ ...audio() })).not.toThrow();
  for (const patch of [
    { width: 2 },
    { height: 2 },
    { dataUrl: "data:audio/wav;base64,AA" },
    { blob: {} },
    { mime: "video/mp4" },
    { byteLength: 0 },
    { sampleRate: 44100.5 },
    { sampleRate: 192001 },
    { channels: 6 },
    { duration: { value: 0, rate: 1 } },
    { timeResolution: 0 },
  ])
    expect(() => validateAssetDescription({ ...audio(), ...patch })).toThrow();
  const asset = audio();
  expect(() =>
    validateProject(
      createProject({
        assets: { [asset.id]: asset },
        pages: [createPage({ layers: [createLayer("image", { assetId: asset.id })] })],
      }),
    ),
  ).toThrow();
});
