import { parseProject, type Project } from "@musart/core";
import type { EditorServices } from "../../../../state/contracts";
import type { TemplateLoadOptions } from "../motion/loader";
import { DESIGNED_TEMPLATES, type DesignedTemplateId } from "./catalog";
import { i18n } from "../../../../state/i18n";

const MAX_BYTES = 1024 * 1024;
const resources = {
  en: {
    unavailable: "Atomic template installation is unavailable in this editor.",
    download: "The template could not be downloaded. Please try again.",
    invalid: "This template is invalid or does not match the selected design.",
    tooLarge: "This template exceeds the 1 MB download limit.",
  },
  fr: {
    unavailable: "Cet éditeur ne peut pas installer ce modèle de façon atomique.",
    download: "Impossible de télécharger le modèle. Réessayez.",
    invalid: "Ce modèle est invalide ou ne correspond pas au design choisi.",
    tooLarge: "Ce modèle dépasse la limite de téléchargement de 1 Mo.",
  },
};
for (const language of ["en", "fr"] as const)
  i18n.addResourceBundle(language, "designedTemplates", resources[language], true, true);
export class DesignedTemplateError extends Error {
  constructor(readonly code: keyof typeof resources.en) {
    super(i18n.t(`designedTemplates:${code}`));
    this.name = "DesignedTemplateError";
  }
}
/** Bound the actual streamed bytes, not just an untrusted Content-Length header. */
async function download(response: Response, signal?: AbortSignal): Promise<string> {
  if (!response.ok) throw new DesignedTemplateError("download");
  if (Number(response.headers.get("content-length")) > MAX_BYTES) {
    await response.body?.cancel();
    throw new DesignedTemplateError("tooLarge");
  }
  if (!response.body) throw new DesignedTemplateError("download");
  const reader = response.body.getReader(),
    parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new DesignedTemplateError("tooLarge");
      parts.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
export async function prepareDesignedTemplate(
  id: DesignedTemplateId,
  options: Pick<TemplateLoadOptions, "signal" | "timing"> = {},
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = fetch,
): Promise<Project> {
  options.signal?.throwIfAborted();
  const definition = DESIGNED_TEMPLATES.find((entry) => entry.id === id);
  if (!definition) throw new DesignedTemplateError("invalid");
  options.timing?.stage("Download template manifest");
  let response: Response;
  try {
    response = await fetcher(`${import.meta.env.BASE_URL}templates/designed/${id}.json`, {
      signal: options.signal,
    });
  } catch {
    options.signal?.throwIfAborted();
    throw new DesignedTemplateError("download");
  }
  const text = await download(response, options.signal);
  options.signal?.throwIfAborted();
  options.timing?.stage("Parse + validate template");
  let project;
  try {
    const manifest = JSON.parse(text) as {
      version?: number;
      templateId?: string;
      project?: unknown;
    };
    if (manifest.version !== 1 || manifest.templateId !== id) throw Error();
    project = parseProject(JSON.stringify(manifest.project));
    const page = project.pages[0];
    if (
      project.pages.length !== 1 ||
      !page ||
      page.width !== definition.width ||
      page.height !== definition.height ||
      (page.motion?.mode ?? "static") !== definition.mode ||
      Object.keys(project.assets).length
    )
      throw Error();
  } catch {
    throw new DesignedTemplateError("invalid");
  }
  options.signal?.throwIfAborted();
  return project;
}

/** Installation and hover consume the same validated bounded preparation. */
export async function openDesignedTemplate(
  services: Pick<EditorServices, "openMediaProject">,
  id: DesignedTemplateId,
  options: TemplateLoadOptions = {},
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = fetch,
): Promise<void> {
  options.signal?.throwIfAborted();
  if (!services.openMediaProject) throw new DesignedTemplateError("unavailable");
  const project = await prepareDesignedTemplate(id, options, fetcher);
  const now = new Date().toISOString();
  options.signal?.throwIfAborted();
  await services.openMediaProject(
    { ...project, id: crypto.randomUUID(), createdAt: now, updatedAt: now },
    [],
    options,
  );
}
