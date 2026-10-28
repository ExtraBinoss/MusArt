import type { ProjectSummary, ProjectInsights } from "../../src/state/contracts";
export function projectSummary(id = "project-a", name = "Study"): ProjectSummary {
  return {
    id,
    name,
    updatedAt: "2026-10-27T10:00:00.000Z",
    width: 320,
    height: 220,
    pages: [
      { id: `${id}-one`, name: "Page one", width: 320, height: 220, thumbnailRevision: "v1" },
      { id: `${id}-two`, name: "Page two", width: 220, height: 320, thumbnailRevision: "v1" },
    ],
  };
}
export function projectInsights(projectId = "project-a"): ProjectInsights {
  return {
    projectId,
    basis: "logical-utf8",
    bytes: {
      manifest: 100,
      assets: 2000,
      thumbnails: 500,
      historyEvents: 300,
      historyAssets: 1000,
      historyBase: 200,
      historyMetadata: 50,
      total: 4150,
    },
    history: { count: 3, limit: 10000, enabled: true },
    origin: { approximate: true, usage: 5000, quota: 1000000 },
  };
}
