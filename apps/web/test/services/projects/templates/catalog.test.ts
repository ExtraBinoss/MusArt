import { expect, test, vi } from "vitest";
import { PRESETS, parseProject } from "@musart/core";
import {
  TEMPLATE_CATALOG,
  createProjectFromTemplate,
} from "../../../../src/services/projects/templates/catalog";
import * as motion from "../../../../src/services/projects/templates/motion/loader";

const ports = () => ({
  createProject: vi.fn<Parameters<typeof createProjectFromTemplate>[0]["createProject"]>(
    async () => {},
  ),
  openPortable: vi.fn<Parameters<typeof createProjectFromTemplate>[0]["openPortable"]>(
    async () => {},
  ),
});
test("publishes exact canonical canvas formats and the editable artwork template", async () => {
  expect(new Set(TEMPLATE_CATALOG.map((item) => item.id)).size).toBe(PRESETS.length + 3);
  expect(Object.isFrozen(TEMPLATE_CATALOG)).toBe(true);
  const services = ports();
  for (const preset of PRESETS) {
    const template = TEMPLATE_CATALOG.find((item) => item.id === `preset:${preset.id}`)!;
    expect(template).toMatchObject({
      width: preset.width,
      height: preset.height,
      brandId: preset.brandId,
    });
    await createProjectFromTemplate(services, template.id);
    expect(services.createProject).toHaveBeenLastCalledWith({
      presetId: preset.id,
      name: preset.name,
      width: preset.width,
      height: preset.height,
      background: "#ffffff",
    });
  }
  expect(services.openPortable).not.toHaveBeenCalled();
  await expect(createProjectFromTemplate(services, "untrusted-template")).rejects.toThrow(
    "Unknown",
  );
});
test("routes Motion bundles to the binary-capable installation service and keeps blank video formats Static", async () => {
  const services = ports();
  const open = vi.spyOn(motion, "openMotionTemplate").mockResolvedValue(undefined);
  const signal = new AbortController().signal;
  const expectedOrigin = { projectId: "origin", pageId: "composition", revision: 3 };
  for (const id of ["in-bloom", "motion-stress-lab"]) {
    const template = TEMPLATE_CATALOG.find((item) => item.id === id)!;
    expect(template.mode).toBe("motion");
    expect(template.descriptionKey).toBeTruthy();
    await createProjectFromTemplate(services, id, { signal, expectedOrigin });
    expect(open).toHaveBeenLastCalledWith(services, id, { signal, expectedOrigin });
  }
  expect(
    TEMPLATE_CATALOG.filter((item) => item.id.startsWith("preset:")).every(
      (item) => item.mode === "static",
    ),
  ).toBe(true);
  expect(services.openPortable).not.toHaveBeenCalled();
  expect(services.createProject).not.toHaveBeenCalled();
  const aborted = new AbortController();
  aborted.abort();
  await expect(
    createProjectFromTemplate(services, "in-bloom", { signal: aborted.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
});
test("creates fresh independent complete techno documents through the real portable boundary", async () => {
  const services = ports();
  const projects = [];
  for (let index = 0; index < 2; index++) {
    await createProjectFromTemplate(services, "afterhours-techno");
    const file = services.openPortable.mock.calls.at(-1)![0];
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("Expected a text document."));
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
    projects.push(parseProject(text));
  }
  expect(projects[0]!.id).not.toBe(projects[1]!.id);
  expect(projects[0]!.pages[0]!.id).not.toBe(projects[1]!.pages[0]!.id);
  expect(projects[0]!.pages[0]!.layers).toHaveLength(150);
  expect(
    projects[0]!.pages[0]!.layers.some((layer) => layer.kind === "text" && layer.fillGradient),
  ).toBe(true);
  expect(services.createProject).not.toHaveBeenCalled();
  services.openPortable.mockRejectedValueOnce(new Error("Quota exceeded"));
  await expect(createProjectFromTemplate(services, "afterhours-techno")).rejects.toThrow(
    "Quota exceeded",
  );
  services.createProject.mockRejectedValueOnce(new Error("Storage blocked"));
  await expect(createProjectFromTemplate(services, `preset:${PRESETS[0]!.id}`)).rejects.toThrow(
    "Storage blocked",
  );
});
