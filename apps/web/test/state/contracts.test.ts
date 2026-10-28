import { expect, test } from "vitest";
import type {
  AppProps,
  EditorServices,
  ExportOptions,
  NewProjectOptions,
  ProjectSummary,
} from "../../src/state/contracts";
test("keeps platform services available through a typed app boundary", () => {
  const format: ExportOptions["format"] = "png";
  const theme: NewProjectOptions["background"] = "#ffffff";
  const name: ProjectSummary["name"] = "Art";
  const identity = <T>(value: T) => value;
  expect(
    identity<Pick<AppProps, "services"> | { services: Partial<EditorServices> }>({ services: {} }),
  ).toEqual({ services: {} });
  expect([format, theme, name]).toEqual(["png", "#ffffff", "Art"]);
  expect(identity<Pick<AppProps, "welcome">>({ welcome: true })).toEqual({ welcome: true });
});
