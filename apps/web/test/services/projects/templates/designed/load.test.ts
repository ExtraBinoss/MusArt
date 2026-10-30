import { expect, it, vi } from "vitest";
import { createProject, createPage } from "@musart/core";
import { openDesignedTemplate } from "../../../../../src/services/projects/templates/designed/load";

const project = () => createProject({ pages: [createPage({ width: 1080, height: 1350 })] });
function payload() {
  return { version: 1, templateId: "colorfield", project: project() };
}
function fixture() {
  const openMediaProject = vi.fn(async () => {});
  const fetcher = vi.fn<NonNullable<Parameters<typeof openDesignedTemplate>[3]>>(
    async () => new Response(JSON.stringify(payload())),
  );
  return { openMediaProject, fetcher };
}
it("prepares a validated independent project and forwards the origin/abort scope atomically", async () => {
  const d = fixture(),
    options = {
      signal: new AbortController().signal,
      expectedOrigin: { projectId: "live", pageId: "active", revision: 4 },
    };
  await openDesignedTemplate(d, "colorfield", options, d.fetcher);
  await openDesignedTemplate(d, "colorfield", options, d.fetcher);
  const calls = d.openMediaProject.mock.calls as unknown as [
    ReturnType<typeof project>,
    [],
    typeof options,
  ][];
  expect(calls).toHaveLength(2);
  expect(calls[0]![0].id).not.toBe(calls[1]![0].id);
  expect(calls[0]!.slice(1)).toEqual([[], options]);
  expect(d.fetcher).toHaveBeenCalledWith(
    expect.stringContaining("templates/designed/colorfield.json"),
    { signal: options.signal },
  );
});
it("reports unsupported, failed, invalid, over-limit and canceled downloads without installing", async () => {
  const d = fixture();
  await expect(openDesignedTemplate({}, "colorfield", {}, d.fetcher)).rejects.toMatchObject({
    code: "unavailable",
  });
  for (const body of [
    "broken json",
    JSON.stringify({ ...payload(), templateId: "other" }),
    JSON.stringify({ ...payload(), project: createProject() }),
  ]) {
    d.fetcher.mockResolvedValueOnce(new Response(body));
    await expect(openDesignedTemplate(d, "colorfield", {}, d.fetcher)).rejects.toMatchObject({
      code: "invalid",
    });
  }
  d.fetcher.mockResolvedValueOnce(new Response("x", { status: 404 }));
  await expect(openDesignedTemplate(d, "colorfield", {}, d.fetcher)).rejects.toMatchObject({
    code: "download",
  });
  d.fetcher.mockResolvedValueOnce(new Response("x", { headers: { "content-length": "1048577" } }));
  await expect(openDesignedTemplate(d, "colorfield", {}, d.fetcher)).rejects.toMatchObject({
    code: "tooLarge",
  });
  d.fetcher.mockResolvedValueOnce(new Response("x".repeat(1048577)));
  await expect(openDesignedTemplate(d, "colorfield", {}, d.fetcher)).rejects.toMatchObject({
    code: "tooLarge",
  });
  d.fetcher.mockRejectedValueOnce(Error("offline"));
  await expect(openDesignedTemplate(d, "colorfield", {}, d.fetcher)).rejects.toMatchObject({
    code: "download",
  });
  const abort = new AbortController();
  abort.abort();
  await expect(
    openDesignedTemplate(d, "colorfield", { signal: abort.signal }, d.fetcher),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(d.openMediaProject).not.toHaveBeenCalled();
});
