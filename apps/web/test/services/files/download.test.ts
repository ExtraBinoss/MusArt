import { describe, expect, it, vi } from "vitest";
import { downloadBlob, safeName } from "../../../src/services/files/download";
describe("portable file downloads", () => {
  it("normalizes filenames without losing useful Unicode names", () => {
    expect(safeName("  Étude <01>  ")).toBe("Étude -01-");
    expect(safeName("a/b:c?d")).toBe("a-b-c-d");
    expect(safeName("\u0000")).toBe("-");
    expect(safeName("")).toBe("Melt");
    expect(safeName("   ")).toBe("Melt");
    expect(safeName("a".repeat(130))).toHaveLength(120);
  });
  it("downloads through a temporary anchor and revokes its URL after browser consumption", () => {
    vi.useFakeTimers();
    const blob = new Blob(["document"], { type: "application/json" });
    const create = vi.fn(() => "blob:test");
    const revoke = vi.fn();
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL = create;
        static revokeObjectURL = revoke;
      },
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe("document.musart");
      expect(this.href).toBe("blob:test");
      expect(this.isConnected).toBe(true);
    });
    downloadBlob(blob, "document.musart");
    expect(create).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector("a")).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revoke).toHaveBeenCalledWith("blob:test");
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});
