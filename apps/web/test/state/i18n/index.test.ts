import { expect, test, vi } from "vitest";
import { changeLanguage, i18n, readLanguage } from "../../../src/state/i18n";
test("changes language and document language together", async () => {
  await changeLanguage("en");
  expect(i18n.t("layers")).toBe("Layers");
  expect(document.documentElement.lang).toBe("en");
  await changeLanguage("fr");
  expect(i18n.t("layers")).toBe("Calques");
});

test("restores a saved language and tolerates unavailable preference storage", async () => {
  localStorage.setItem("musart.language", "en");
  expect(readLanguage()).toBe("en");
  localStorage.setItem("musart.language", "fr");
  expect(readLanguage()).toBe("fr");
  const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("Blocked");
  });
  expect(readLanguage()).toBe("fr");
  get.mockRestore();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Blocked");
  });
  await expect(changeLanguage("en")).resolves.toBeUndefined();
  await changeLanguage("fr");
});
