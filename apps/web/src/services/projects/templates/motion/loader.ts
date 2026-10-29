import { isVideoAsset, parseProject } from "@musart/core";
import type { EditorServices } from "../../../../state/contracts";
import { i18n } from "../../../../state/i18n";
import type { MediaOriginalInput } from "../../media/model";
import type { MotionTemplateId, MotionTemplateManifest } from "./model";

const resources = {
  en: {
    unsupported: "This editor cannot install video templates.",
    download: "The template could not be downloaded. Please try again.",
    invalid: "The template bundle is invalid.",
    integrity: "The template video does not match its original source.",
    tooLarge: "The template bundle exceeds its download limit.",
  },
  fr: {
    unsupported: "Cet éditeur ne peut pas installer les modèles vidéo.",
    download: "Le modèle n’a pas pu être téléchargé. Réessayez.",
    invalid: "Le modèle est invalide.",
    integrity: "La vidéo du modèle ne correspond pas à sa source originale.",
    tooLarge: "Le modèle dépasse sa limite de téléchargement.",
  },
};
for (const [language, values] of Object.entries(resources))
  i18n.addResourceBundle(language, "motionTemplates", values, true, true);

export class MotionTemplateError extends Error {
  constructor(readonly code: keyof typeof resources.en) {
    super(i18n.t(`motionTemplates:${code}`));
    this.name = "MotionTemplateError";
  }
}

export interface TemplateLoadOptions {
  readonly signal?: AbortSignal;
  readonly expectedOrigin?: {
    readonly projectId: string;
    readonly pageId: string;
    readonly revision: number;
  };
}

export type TemplateFetcher = (url: string, init?: RequestInit) => Promise<Response>;

async function download(
  url: string,
  fetcher: TemplateFetcher,
  signal?: AbortSignal,
): Promise<Response> {
  try {
    return await fetcher(url, { signal });
  } catch {
    signal?.throwIfAborted();
    throw new MotionTemplateError("download");
  }
}

async function boundedResponse(
  response: Response,
  limit: number,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  signal?.throwIfAborted();
  if (!response.ok) throw new MotionTemplateError("download");
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new MotionTemplateError("tooLarge");
  }
  if (!response.body) {
    const bytes = await response.arrayBuffer();
    signal?.throwIfAborted();
    if (bytes.byteLength > limit) throw new MotionTemplateError("tooLarge");
    return bytes;
  }
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new MotionTemplateError("tooLarge");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

export function parseMotionTemplateManifest(
  value: unknown,
  id: MotionTemplateId,
): MotionTemplateManifest {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw Error();
    const manifest = value as MotionTemplateManifest;
    if (
      manifest.version !== 1 ||
      manifest.templateId !== id ||
      !Array.isArray(manifest.originals) ||
      manifest.originals.length !== 1
    )
      throw Error();
    const project = parseProject(JSON.stringify(manifest.project));
    if (project.pages.length !== 1 || project.pages[0]!.motion?.mode !== "motion") throw Error();
    const videos = Object.values(project.assets).filter(isVideoAsset);
    if (!videos.length) throw Error();
    for (const original of manifest.originals) {
      if (
        !original ||
        typeof original.file !== "string" ||
        !/^media\/[a-zA-Z0-9][a-zA-Z0-9.-]*\.mp4$/.test(original.file) ||
        original.file.includes("..") ||
        !Number.isSafeInteger(original.byteLength) ||
        original.byteLength <= 0 ||
        original.byteLength > 8 * 1024 * 1024 ||
        original.mime !== "video/mp4" ||
        !/^sha256:[a-f0-9]{64}$/.test(original.contentRevision)
      )
        throw Error();
      if (
        !videos.every(
          (asset) =>
            asset.originalId === original.originalId &&
            asset.contentRevision === original.contentRevision &&
            asset.byteLength === original.byteLength &&
            asset.mime === original.mime,
        )
      )
        throw Error();
    }
    return { version: 1, templateId: id, project, originals: manifest.originals };
  } catch {
    throw new MotionTemplateError("invalid");
  }
}

/** Fully prepare and validate before one durable project+originals installation. No portable fallback. */
export async function openMotionTemplate(
  services: Pick<EditorServices, "openMediaProject">,
  templateId: MotionTemplateId,
  options: TemplateLoadOptions = {},
  fetcher: TemplateFetcher = fetch,
): Promise<void> {
  options.signal?.throwIfAborted();
  if (templateId !== "in-bloom" && templateId !== "motion-stress-lab")
    throw new MotionTemplateError("invalid");
  if (!services.openMediaProject) throw new MotionTemplateError("unsupported");
  const base = `${import.meta.env.BASE_URL}templates/motion/`;
  const response = await download(`${base}${templateId}.json`, fetcher, options.signal);
  const bytes = await boundedResponse(response, 2 * 1024 * 1024, options.signal);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new MotionTemplateError("invalid");
  }
  const manifest = parseMotionTemplateManifest(parsed, templateId);
  const originals: MediaOriginalInput[] = [];
  for (const original of manifest.originals) {
    const result = await download(`${base}${original.file}`, fetcher, options.signal);
    const data = await boundedResponse(result, original.byteLength, options.signal);
    if (data.byteLength !== original.byteLength) throw new MotionTemplateError("integrity");
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    options.signal?.throwIfAborted();
    if (`sha256:${digest}` !== original.contentRevision) throw new MotionTemplateError("integrity");
    originals.push({
      originalId: original.originalId,
      contentRevision: original.contentRevision,
      blob: new Blob([data], { type: original.mime }),
    });
  }
  options.signal?.throwIfAborted();
  const now = new Date().toISOString();
  await services.openMediaProject(
    { ...manifest.project, id: crypto.randomUUID(), createdAt: now, updatedAt: now },
    originals,
    options,
  );
}
