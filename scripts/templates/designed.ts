import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { serializeProject, validateProject } from "../../packages/core/src/index";
import { buildDesignedTemplate } from "../../apps/web/src/services/projects/templates/designed/build";
import { DESIGNED_TEMPLATES } from "../../apps/web/src/services/projects/templates/designed/catalog";

/** Reproducible template authoring through public core commands, with no browser or renderer. */
export async function generateDesignedTemplates(outputDirectory: string): Promise<string[]> {
  await mkdir(outputDirectory, { recursive: true });
  const paths: string[] = [];
  for (const { id } of DESIGNED_TEMPLATES) {
    const { initial, project, batches } = buildDesignedTemplate(id);
    validateProject(project);
    const payloads = {
      [`${id}.json`]: JSON.stringify({ version: 1, templateId: id, project }),
      [`${id}.commands.json`]: JSON.stringify({ version: 1, initial, batches }),
      [`${id}.musart`]: serializeProject(project),
    };
    for (const [name, contents] of Object.entries(payloads)) {
      const path = resolve(outputDirectory, name);
      await writeFile(path, `${contents}\n`);
      paths.push(path);
    }
  }
  return paths;
}
if (import.meta.main)
  for (const path of await generateDesignedTemplates(resolve("apps/web/public/templates/designed")))
    console.log(path);
