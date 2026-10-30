import { expect, test, vi } from "vitest";
import { createProject } from "@musart/core";
import { PreviewSourceCache } from "../../../../../src/components/projects/templates/motion-preview/source-cache";

const signal = () => new AbortController().signal;
test("templates retain validated geometry and originals without repeated preparation", async () => {
  const cache = new PreviewSourceCache(),
    source = { project: createProject(), originals: [] };
  const prepare = vi.fn(async () => source);
  expect(await cache.template("in-bloom", signal(), prepare)).toBe(source);
  expect(await cache.template("in-bloom", signal(), prepare)).toBe(source);
  expect(cache.retain(source.project)).toBe(source.project);
  expect(prepare).toHaveBeenCalledOnce();
  cache.clear();
  await cache.template("in-bloom", signal(), prepare);
  expect(prepare).toHaveBeenCalledTimes(2);
});
test("fresh saved reads reuse only exact content, including geometry and original revisions", () => {
  const cache = new PreviewSourceCache(),
    project = createProject();
  expect(cache.retain(project)).toBe(project);
  expect(cache.retain(structuredClone(project))).toBe(project);
  const edited = { ...project, name: "Changed in another tab" };
  expect(cache.retain(edited)).toBe(edited);
  expect(cache.retain(project)).toBe(project);
});
test("LRU count, estimated bytes and original blob budgets bound retained sources", async () => {
  const cache = new PreviewSourceCache(5000),
    first = createProject();
  cache.retain(first);
  for (let i = 0; i < 5; i++) cache.retain(createProject());
  const clone = structuredClone(first);
  expect(cache.retain(clone)).toBe(clone);
  const prepare = vi.fn(async () => ({
    project: createProject(),
    originals: [{ originalId: "v", contentRevision: "r", blob: new Blob([new Uint8Array(5001)]) }],
  }));
  await cache.template("in-bloom", signal(), prepare);
  await cache.template("in-bloom", signal(), prepare);
  expect(prepare).toHaveBeenCalledTimes(2);
});
test("aborted, failed and cleared in-flight preparations cannot repopulate the cache", async () => {
  const cache = new PreviewSourceCache(),
    controller = new AbortController();
  const source = { project: createProject(), originals: [] };
  const prepare = vi.fn(async () => {
    controller.abort();
    return source;
  });
  await expect(cache.template("in-bloom", controller.signal, prepare)).rejects.toMatchObject({
    name: "AbortError",
  });
  const failing = vi.fn(async () => {
    throw Error("Missing original");
  });
  await expect(cache.template("in-bloom", signal(), failing)).rejects.toThrow("Missing original");
  const clearing = vi.fn(async () => {
    cache.clear();
    return source;
  });
  await cache.template("in-bloom", signal(), clearing);
  await cache.template("in-bloom", signal(), clearing);
  expect(clearing).toHaveBeenCalledTimes(2);
});

test("compilation retains its private immutable geometry copy until exact source changes", () => {
  const cache = new PreviewSourceCache(),
    project = createProject();
  cache.retain(project);
  const first = cache.compile(project, project.pages[0]!.id);
  expect(cache.compile(cache.retain(structuredClone(project)), project.pages[0]!.id)).toBe(first);
  const edited = { ...project, name: "New revision" };
  cache.retain(edited);
  expect(cache.compile(edited, edited.pages[0]!.id)).not.toBe(first);
  expect(project.pages[0]).not.toBe(first.composition);
});
