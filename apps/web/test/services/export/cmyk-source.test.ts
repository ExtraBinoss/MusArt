import { expect, test, vi } from "vitest";
import { createPage, createProject, EditorEngine } from "@musart/core";
import { DEFAULT_PRINT } from "@musart/render";
import { createCompositionExporter } from "../../../src/services/export/composition";

test("encodes CMYK once from source colors and keeps the document proof for RGB delivery", async () => {
  const engine = new EditorEngine(createProject({ pages: [createPage({ colorSpace: "cmyk" })] }));
  const { project, revision } = engine.getSnapshot(),
    page = project.pages[0]!;
  const source = new Blob(["source"], { type: "image/png" });
  const image = vi.fn<typeof import("@musart/render").exportComposition>(async () => source);
  const encode = vi.fn<typeof import("@musart/render").encodeManagedImage>(
    async () => new Blob(["CMYK"], { type: "image/tiff" }),
  );
  const run = createCompositionExporter(engine, {
    render: async () => ({
      exportComposition: image,
      exportMotionVideo: vi.fn(),
      encodeManagedImage: encode,
      DEFAULT_PRINT,
    }),
    download: vi.fn(),
    mediaResolverFor: () => ({ resolveOriginal: vi.fn() }),
  });
  const scope = { projectId: project.id, compositionId: page.id, revision, page };
  await run(
    {
      mode: "static",
      compositionId: page.id,
      scale: 1,
      image: { format: "tiff", colorMode: "cmyk", quality: 1, allPages: false },
    },
    scope,
  );
  expect(image.mock.calls[0]![2]).toMatchObject({ format: "png", colorOutput: "source" });
  expect(encode).toHaveBeenCalledWith(
    expect.objectContaining({
      blob: source,
      options: expect.objectContaining({ colorMode: "cmyk" }),
    }),
    undefined,
  );
  await run(
    {
      mode: "static",
      compositionId: page.id,
      scale: 1,
      image: { format: "png", colorMode: "srgb", quality: 1, allPages: false },
    },
    scope,
  );
  expect(image.mock.calls[1]![2]).toMatchObject({ format: "png", colorOutput: "display" });
  expect(encode).toHaveBeenCalledTimes(2);
  expect(encode.mock.calls[1]![0].options.colorMode).toBe("srgb");
  expect(engine.getSnapshot().revision).toBe(revision);
});
