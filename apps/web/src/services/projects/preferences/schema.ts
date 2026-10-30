import type { ProjectLayoutPreferences } from "./model";

export const projectPreferencesKey = (projectId: string) =>
  JSON.stringify(["musart:project-layout", projectId]);

export const preferenceFields = [
  "workspaceLayout",
  "sidebarLayout",
  "timelineHeight",
  "timelineZoom",
] as const;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

/** Only the four small presentation fields are accepted; documents and assets cannot enter it. */
export function validateProjectPreferences(value: unknown): ProjectLayoutPreferences {
  if (
    !record(value) ||
    Object.keys(value).some((key) => !preferenceFields.some((field) => field === key))
  )
    throw new Error("Invalid project layout preferences.");
  const result: ProjectLayoutPreferences = {};
  for (const [field, first, second] of [
    ["workspaceLayout", "workspace", "inspector"],
    ["sidebarLayout", "properties", "layers"],
  ] as const) {
    const layout = value[field];
    if (layout === undefined) continue;
    if (
      !record(layout) ||
      Object.keys(layout).length !== 2 ||
      !finite(layout[first], 0, 100) ||
      !finite(layout[second], 0, 100) ||
      Math.abs(layout[first] + layout[second] - 100) > 0.01
    )
      throw new Error(`Invalid ${field} project preference.`);
    if (field === "workspaceLayout")
      result.workspaceLayout = { workspace: layout[first], inspector: layout[second] };
    else result.sidebarLayout = { properties: layout[first], layers: layout[second] };
  }
  if (value.timelineHeight !== undefined) {
    if (!finite(value.timelineHeight, 0.01, 1))
      throw new Error("Invalid timeline height preference.");
    result.timelineHeight = value.timelineHeight;
  }
  if (value.timelineZoom !== undefined) {
    if (!finite(value.timelineZoom, 20, 640)) throw new Error("Invalid timeline zoom preference.");
    result.timelineZoom = value.timelineZoom;
  }
  return result;
}

export function parseProjectPreferences(raw: string | undefined): ProjectLayoutPreferences {
  if (raw === undefined) return {};
  const stored: unknown = JSON.parse(raw);
  if (!record(stored) || stored.version !== 1 || !record(stored.values))
    throw new Error("Unsupported project layout preferences.");
  return validateProjectPreferences(stored.values);
}
