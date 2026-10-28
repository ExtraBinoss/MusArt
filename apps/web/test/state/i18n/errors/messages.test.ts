import { expect, test } from "vitest";
import { i18n } from "../../../../src/state/i18n";
import { messages } from "../../../../src/state/i18n/errors/messages";

test.each(["en", "fr"] as const)("registers GPU and storage errors in %s", (lng) => {
  expect(i18n.t("errors:gpuUnavailable", { lng })).toBe(messages[lng].gpuUnavailable);
  expect(i18n.t("errors:gpuError", { lng, message: "device lost" })).toBe(
    messages[lng].gpuError.replace("{{message}}", "device lost"),
  );
  expect(i18n.t("errors:staleProjectWrite", { lng })).toBe(messages[lng].staleProjectWrite);
});
