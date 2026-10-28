import { expect, test } from "vitest";
import { i18n } from "../../../../src/state/i18n";
import { messages } from "../../../../src/state/i18n/errors/messages";

test.each(["en", "fr"] as const)("registers GPU and storage errors in %s", (lng) => {
  expect(i18n.t("errors:gpuUnavailable", { lng })).toBe(messages[lng].gpuUnavailable);
  expect(i18n.t("errors:gpuError", { lng, message: "device lost" })).toBe(
    messages[lng].gpuError.replace("{{message}}", "device lost"),
  );
  expect(i18n.t("errors:staleProjectWrite", { lng })).toBe(messages[lng].staleProjectWrite);
  expect(i18n.t("errors:uncertainJournalInitialization", { lng })).toBe(
    messages[lng].uncertainJournalInitialization,
  );
  expect(i18n.t("errors:uncertainProjectWrite", { lng })).toBe(messages[lng].uncertainProjectWrite);
  expect(i18n.t("errors:journalQueueFull", { lng })).toBe(messages[lng].journalQueueFull);
  expect(i18n.t("errors:pixelSelectionTooLarge", { lng })).toBe(
    messages[lng].pixelSelectionTooLarge,
  );
  expect(i18n.t("errors:pixelSelectionImageRequired", { lng })).toBe(
    messages[lng].pixelSelectionImageRequired,
  );
});
