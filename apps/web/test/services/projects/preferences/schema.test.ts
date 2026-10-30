import { expect, test } from "vitest";
import {
  parseProjectPreferences,
  projectPreferencesKey,
  validateProjectPreferences,
} from "../../../../src/services/projects/preferences/schema";

test("validates the small versioned record without admitting document fields", () => {
  const values = {
    workspaceLayout: { workspace: 75, inspector: 25 },
    sidebarLayout: { properties: 60, layers: 40 },
    timelineZoom: 320,
    timelineHeight: 0.4,
  };
  expect(parseProjectPreferences(JSON.stringify({ version: 1, values }))).toEqual(values);
  expect(validateProjectPreferences(values)).not.toBe(values);
  expect(parseProjectPreferences(undefined)).toEqual({});
  expect(projectPreferencesKey("a:b")).not.toBe(projectPreferencesKey("a"));
  for (const value of [
    null,
    [],
    { assets: {} },
    { timelineZoom: NaN },
    { timelineZoom: 641 },
    { timelineHeight: 0 },
    { workspaceLayout: { workspace: 60, inspector: 20 } },
    { sidebarLayout: { properties: 60, layers: 40, extra: 0 } },
  ])
    expect(() => validateProjectPreferences(value)).toThrow();
  for (const raw of [
    "bad-json",
    JSON.stringify({ version: 2, values }),
    JSON.stringify({ version: 1, values: [] }),
  ])
    expect(() => parseProjectPreferences(raw)).toThrow();
});
