import { createProject, createPage, createLayer } from "@musart/core";
import { openStudioDatabase } from "../../../../src/services/projects/database";
import { prepareProjectWrite } from "../../../../src/services/projects/persistence/prepare";
import { logicalBytes } from "../../../../src/services/projects/logical-bytes";
export function project() {
  return createProject({
    id: "project",
    pages: [
      createPage({ id: "page", layers: [createLayer("image", { id: "shape", assetId: "photo" })] }),
    ],
    assets: {
      photo: {
        id: "photo",
        name: "Photo",
        mime: "image/png",
        width: 1,
        height: 1,
        dataUrl: "data:image/png;base64,AAAA",
      },
    },
  });
}
export function prepared() {
  const input = project();
  return {
    project: input,
    ...prepareProjectWrite(input, { page: "pixel-revision" }, input.pages.map(logicalBytes), {
      expectedRevision: "",
    }),
  };
}
export async function fixture() {
  const db = await openStudioDatabase(crypto.randomUUID());
  return { ...prepared(), db };
}
