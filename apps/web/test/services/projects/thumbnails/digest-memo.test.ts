import { expect, test, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { ThumbnailDigestMemo } from "../../../../src/services/projects/thumbnails/digest-memo";

function fixture() {
  const engine = new EditorEngine(
    createProject({
      pages: [createPage({ layers: [createLayer("rectangle")] })],
    }),
  );
  const project = engine.getSnapshot().project;
  return { engine, project, page: project.pages[0]!, memo: new ThumbnailDigestMemo() };
}
function deferred() {
  let resolve!: (value: string) => void, reject!: (error: Error) => void;
  const promise = new Promise<string>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test("coalesces pending and completed digests only after the certified project proves its assets", async () => {
  const d = fixture(),
    gate = deferred(),
    hash = vi.fn(() => gate.promise);
  d.memo.certify(d.project);
  const first = d.memo.get(d.page, d.project.assets, hash);
  const second = d.memo.get(d.page, d.project.assets, hash);
  await Promise.resolve();
  expect(hash).toHaveBeenCalledOnce();
  gate.resolve("digest");
  expect(await first).toBe("digest");
  expect(await second).toBe("digest");
  expect(await d.memo.get(d.page, d.project.assets, hash)).toBe("digest");
  expect(hash).toHaveBeenCalledOnce();
});

test("never trusts arbitrary frozen pages or a shallowly frozen external asset collection", async () => {
  const d = fixture(),
    hash = vi.fn().mockResolvedValue("digest");
  await d.memo.get(d.page, d.project.assets, hash);
  await d.memo.get(d.page, d.project.assets, hash);
  expect(hash).toHaveBeenCalledTimes(2);
  d.memo.certify(d.project);
  const externalAssets = Object.freeze({}),
    externalPage = Object.freeze(structuredClone(d.page));
  await d.memo.get(d.page, externalAssets, hash);
  await d.memo.get(d.page, externalAssets, hash);
  await d.memo.get(externalPage, d.project.assets, hash);
  await d.memo.get(externalPage, d.project.assets, hash);
  const externalProject = Object.freeze(structuredClone(d.project));
  d.memo.certify(externalProject);
  await d.memo.get(externalProject.pages[0]!, externalProject.assets, hash);
  await d.memo.get(externalProject.pages[0]!, externalProject.assets, hash);
  expect(hash).toHaveBeenCalledTimes(8);
});

test("changed page or asset identities cannot reuse a digest from another certified graph", async () => {
  const d = fixture(),
    hash = vi
      .fn()
      .mockResolvedValueOnce("before")
      .mockResolvedValueOnce("after")
      .mockResolvedValue("other-assets");
  d.memo.certify(d.project);
  expect(await d.memo.get(d.page, d.project.assets, hash)).toBe("before");
  d.engine.execute({ type: "updateLayers", ids: [d.page.layers[0]!.id], patch: { x: 99 } });
  const changed = d.engine.getSnapshot().project;
  d.memo.certify(changed);
  expect(await d.memo.get(changed.pages[0]!, changed.assets, hash)).toBe("after");
  const other = new EditorEngine(createProject()).getSnapshot().project;
  d.memo.certify(other);
  expect(await d.memo.get(d.page, other.assets, hash)).toBe("other-assets");
  expect(hash).toHaveBeenCalledTimes(3);
});

test("failed digests are evicted and a late failure cannot erase a newer asset identity", async () => {
  const d = fixture(),
    old = deferred();
  d.memo.certify(d.project);
  const pending = d.memo.get(d.page, d.project.assets, () => old.promise);
  const failed = expect(pending).rejects.toThrow("failed");
  const other = new EditorEngine(createProject()).getSnapshot().project;
  d.memo.certify(other);
  const hash = vi.fn().mockResolvedValue("new");
  expect(await d.memo.get(d.page, other.assets, hash)).toBe("new");
  old.reject(Error("failed"));
  await failed;
  expect(await d.memo.get(d.page, other.assets, hash)).toBe("new");
  expect(hash).toHaveBeenCalledOnce();
  const fail = vi.fn().mockRejectedValueOnce(Error("retry")).mockResolvedValueOnce("recovered");
  await expect(d.memo.get(d.page, d.project.assets, fail)).rejects.toThrow("retry");
  expect(await d.memo.get(d.page, d.project.assets, fail)).toBe("recovered");
  expect(fail).toHaveBeenCalledTimes(2);
});

test("reset rejects pending results, prevents unstarted work and discards prior asset proofs", async () => {
  const d = fixture(),
    gate = deferred();
  d.memo.certify(d.project);
  const first = d.memo.get(d.page, d.project.assets, () => gate.promise);
  await Promise.resolve();
  const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
  d.memo.reset();
  gate.resolve("stale");
  await rejected;
  const hash = vi.fn().mockResolvedValue("new");
  d.memo.certify(d.project);
  const unstarted = d.memo.get(d.page, d.project.assets, hash);
  const stopped = expect(unstarted).rejects.toMatchObject({ name: "AbortError" });
  d.memo.reset();
  await stopped;
  expect(hash).not.toHaveBeenCalled();
  const a = d.memo.get(d.page, d.project.assets, hash),
    b = d.memo.get(d.page, d.project.assets, hash);
  expect(a).not.toBe(b);
  await Promise.all([a, b]);
  expect(hash).toHaveBeenCalledTimes(2);
  d.memo.certify(d.project);
  const certified = d.memo.get(d.page, d.project.assets, hash);
  const reused = d.memo.get(d.page, d.project.assets, hash);
  expect(await Promise.all([certified, reused])).toEqual(["new", "new"]);
  const cached = d.memo.get(d.page, d.project.assets, hash);
  const cancelledHit = expect(cached).rejects.toMatchObject({ name: "AbortError" });
  d.memo.reset();
  await cancelledHit;
});

test("uncertified computations capture mutable caller values immediately and report synchronous errors", async () => {
  const memo = new ThumbnailDigestMemo(),
    page = createPage({ layers: [createLayer("rectangle", { x: 1 })] });
  const result = memo.get(page, {}, () => Promise.resolve(String(page.layers[0]!.x)));
  page.layers[0]!.x = 99;
  expect(await result).toBe("1");
  await expect(
    memo.get(page, {}, () => {
      throw Error("capture failed");
    }),
  ).rejects.toThrow("capture failed");
});
