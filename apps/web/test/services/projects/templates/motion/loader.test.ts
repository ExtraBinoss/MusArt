import { createHash } from "node:crypto";
import { expect, test, vi } from "vitest";
import { createBloomTemplate } from "../../../../../src/services/projects/templates/motion/showcase";
import {
  MotionTemplateError,
  openMotionTemplate,
  parseMotionTemplateManifest,
  type TemplateFetcher,
} from "../../../../../src/services/projects/templates/motion/loader";
import type { MotionTemplateManifest } from "../../../../../src/services/projects/templates/motion/model";
import type { EditorServices } from "../../../../../src/state/contracts";
import { templateMedia } from "../../../../support/motion-template-media";
import { i18n } from "../../../../../src/state/i18n";

function fixture() {
  const bytes = new TextEncoder().encode("realbytes");
  const media = templateMedia();
  media.video.contentRevision = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  const { project } = createBloomTemplate(media);
  const manifest: MotionTemplateManifest = {
    version: 1,
    templateId: "in-bloom",
    project,
    originals: [
      {
        originalId: media.video.originalId,
        contentRevision: media.video.contentRevision,
        byteLength: bytes.byteLength,
        mime: "video/mp4",
        file: "media/flower.mp4",
      },
    ],
  };
  const openMediaProject = vi.fn<NonNullable<EditorServices["openMediaProject"]>>(
    async () => undefined,
  );
  const fetcher = vi.fn<TemplateFetcher>(async (url) =>
    url.endsWith(".json") ? new Response(JSON.stringify(manifest)) : new Response(bytes),
  );
  return { bytes, manifest, openMediaProject, fetcher };
}

test("installs validated manifest + one verified shared original atomically with a fresh durable project ID", async () => {
  const f = fixture(),
    signal = new AbortController().signal;
  const expectedOrigin = { projectId: "origin", pageId: "page", revision: 7 };
  await openMotionTemplate(f, "in-bloom", { signal, expectedOrigin }, f.fetcher);
  await openMotionTemplate(f, "in-bloom", { signal, expectedOrigin }, f.fetcher);
  const first = f.openMediaProject.mock.calls[0]!,
    second = f.openMediaProject.mock.calls[1]!;
  expect(first[0].id).not.toBe(f.manifest.project.id);
  expect(first[0].id).not.toBe(second[0].id);
  expect(first[0].pages).toEqual(f.manifest.project.pages);
  expect(first[1]).toHaveLength(1);
  expect(first[1][0]!.blob.size).toBe(9);
  expect(first[1][0]!.blob.type).toBe("video/mp4");
  expect(first[2]).toEqual({ signal, expectedOrigin });
  expect(f.fetcher).toHaveBeenCalledWith("/templates/motion/media/flower.mp4", { signal });
  expect(f.manifest.project.id).toBe("template-in-bloom");
});

test("rejects unsupported editors, aborted requests and late native results before project installation", async () => {
  const f = fixture(),
    request = new AbortController();
  await expect(openMotionTemplate({}, "in-bloom", {}, f.fetcher)).rejects.toMatchObject({
    code: "unsupported",
  });
  expect(f.fetcher).not.toHaveBeenCalled();
  await expect(
    openMotionTemplate(f, "../untrusted" as "in-bloom", {}, f.fetcher),
  ).rejects.toMatchObject({ code: "invalid" });
  request.abort();
  await expect(
    openMotionTemplate(f, "in-bloom", { signal: request.signal }, f.fetcher),
  ).rejects.toMatchObject({ name: "AbortError" });
  const late = new AbortController();
  f.fetcher.mockImplementationOnce(async () => {
    late.abort();
    return new Response(JSON.stringify(f.manifest));
  });
  await expect(
    openMotionTemplate(f, "in-bloom", { signal: late.signal }, f.fetcher),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(f.openMediaProject).not.toHaveBeenCalled();
});

test("rejects invalid modes, binary references, cross-origin/path traversal and mismatched template identities", () => {
  const f = fixture();
  for (const value of [
    null,
    [],
    {},
    { ...f.manifest, version: 2 },
    { ...f.manifest, templateId: "other" },
    { ...f.manifest, originals: [] },
    { ...f.manifest, originals: [...f.manifest.originals, ...f.manifest.originals] },
    { ...f.manifest, project: { ...f.manifest.project, assets: {} } },
    {
      ...f.manifest,
      project: {
        ...f.manifest.project,
        pages: [{ ...f.manifest.project.pages[0], motion: undefined }],
      },
    },
  ])
    expect(() => parseMotionTemplateManifest(value, "in-bloom")).toThrow(MotionTemplateError);
  for (const patch of [
    { file: "https://evil.invalid/a.mp4" },
    { file: "media/../flower.mp4" },
    { file: "media/a..mp4" },
    { contentRevision: "sha256:wrong" },
    { byteLength: 0 },
    { byteLength: 9 * 1024 * 1024 },
    { mime: "text/html" },
    { originalId: "different" },
  ])
    expect(() =>
      parseMotionTemplateManifest(
        { ...f.manifest, originals: [{ ...f.manifest.originals[0], ...patch }] },
        "in-bloom",
      ),
    ).toThrow(MotionTemplateError);
});

test("reports download, malformed JSON, bounded stream overflow and original integrity failures honestly", async () => {
  const f = fixture();
  f.fetcher.mockRejectedValueOnce(new TypeError("Network unavailable"));
  await expect(openMotionTemplate(f, "in-bloom", {}, f.fetcher)).rejects.toMatchObject({
    code: "download",
  });
  f.fetcher.mockResolvedValueOnce(new Response("no", { status: 404 }));
  await expect(openMotionTemplate(f, "in-bloom", {}, f.fetcher)).rejects.toMatchObject({
    code: "download",
  });
  f.fetcher.mockResolvedValueOnce(new Response("invalid json"));
  await expect(openMotionTemplate(f, "in-bloom", {}, f.fetcher)).rejects.toMatchObject({
    code: "invalid",
  });
  const cancel = vi.fn();
  f.fetcher.mockResolvedValueOnce(
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
        },
        cancel,
      }),
    ),
  );
  await expect(openMotionTemplate(f, "in-bloom", {}, f.fetcher)).rejects.toMatchObject({
    code: "tooLarge",
  });
  expect(cancel).toHaveBeenCalledOnce();
  f.fetcher.mockResolvedValueOnce(new Response("", { headers: { "content-length": "99999999" } }));
  await expect(openMotionTemplate(f, "in-bloom", {}, f.fetcher)).rejects.toMatchObject({
    code: "tooLarge",
  });
  for (const bytes of ["short", "bad-bytes"]) {
    f.fetcher
      .mockResolvedValueOnce(new Response(JSON.stringify(f.manifest)))
      .mockResolvedValueOnce(new Response(bytes));
    await expect(openMotionTemplate(f, "in-bloom", {}, f.fetcher)).rejects.toMatchObject({
      code: "integrity",
    });
  }
  expect(f.openMediaProject).not.toHaveBeenCalled();
  f.openMediaProject.mockRejectedValueOnce(new Error("Storage conflict"));
  await expect(openMotionTemplate(f, "in-bloom", {}, f.fetcher)).rejects.toThrow(
    "Storage conflict",
  );
});

test("localizes actionable template failures in English and French", () => {
  expect(i18n.getResource("en", "motionTemplates", "integrity")).toContain("original source");
  expect(i18n.getResource("fr", "motionTemplates", "unsupported")).toContain("modèles vidéo");
});
