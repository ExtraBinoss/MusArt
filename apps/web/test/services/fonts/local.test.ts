import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LocalFonts } from "../../../src/services/fonts/local";
import { cleanup, fontFile, platform } from "./fixtures";
const data = () => ({
  family: "Test Mono",
  fullName: "Test Mono Regular",
  postscriptName: "TestMono-Regular",
  style: "Regular",
  blob: vi.fn(async () => fontFile()),
});
beforeEach(platform);
afterEach(cleanup);
it("queries native metadata synchronously in the trigger gesture and reads no blobs until requested", async () => {
  const font = data(),
    query = vi.fn(async () => [font, font, { ...font, postscriptName: "" }]),
    local = new LocalFonts(query);
  const pending = local.discover();
  expect(query).toHaveBeenCalledOnce();
  const definitions = await pending;
  expect(definitions).toEqual([
    {
      id: "local:TestMono-Regular",
      family: "local:TestMono-Regular",
      label: "Test Mono Regular",
      category: "mono",
      source: "local",
    },
  ]);
  expect(font.blob).not.toHaveBeenCalled();
  expect(await local.discover()).toBe(definitions);
  expect(await local.blob("LOCAL:TestMono-Regular")).toBeInstanceOf(Blob);
  local.dispose();
  await expect(local.blob(font.family)).rejects.toMatchObject({ code: "disposed" });
});
it("handles unsupported platforms and denied permission once without repeated prompts", async () => {
  vi.stubGlobal("queryLocalFonts", undefined);
  const missing = new LocalFonts();
  expect(missing.supported).toBe(false);
  expect(await missing.discover()).toEqual([]);
  await expect(missing.blob("missing")).rejects.toMatchObject({ code: "notFound" });
  const query = vi.fn(() => {
      throw new DOMException("Denied", "NotAllowedError");
    }),
    local = new LocalFonts(query);
  await expect(local.discover()).rejects.toMatchObject({ code: "permission" });
  await expect(local.discover()).rejects.toMatchObject({ code: "permission" });
  expect(query).toHaveBeenCalledOnce();
  local.dispose();
  missing.dispose();
});
it("binds the automatic native API and rejects pending results after disposal", async () => {
  const query = vi.fn(async () => [data()]);
  vi.stubGlobal("queryLocalFonts", query);
  const local = new LocalFonts();
  expect(local.supported).toBe(true);
  await local.discover();
  expect(query.mock.contexts[0]).toBe(globalThis);
  let finish!: (value: ReturnType<typeof data>[]) => void;
  const pendingLocal = new LocalFonts(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const first = pendingLocal.discover(),
    second = pendingLocal.discover();
  expect(second).toBe(first);
  pendingLocal.dispose();
  finish([data()]);
  await expect(first).rejects.toMatchObject({ code: "disposed" });
  await expect(pendingLocal.discover()).rejects.toMatchObject({ code: "disposed" });
  local.dispose();
});
it("rejects a delayed blob after its owning library closes", async () => {
  let finish!: (value: Blob) => void;
  const font = {
      ...data(),
      blob: vi.fn(
        () =>
          new Promise<Blob>((resolve) => {
            finish = resolve;
          }),
      ),
    },
    local = new LocalFonts(async () => [font]);
  await local.discover();
  const pending = local.blob("local:TestMono-Regular");
  local.dispose();
  finish(fontFile());
  await expect(pending).rejects.toMatchObject({ code: "disposed" });
});
