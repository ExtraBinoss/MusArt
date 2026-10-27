import { afterEach, describe, expect, it, vi } from "vitest";
import {
  processSelection,
  handleSelection,
} from "../../../src/services/selection/selection.worker";
const sam = vi.hoisted(() => ({ prepareSam: vi.fn(), segmentObject: vi.fn() }));
vi.mock("../../../src/services/selection/sam", () => sam);
afterEach(() => {
  vi.unstubAllGlobals();
});
describe("selection worker protocol", () => {
  it("returns connected wand masks and posts transferable result buffers", async () => {
    const request = {
      id: 3,
      type: "wand",
      pixels: new Uint8ClampedArray([20, 20, 20, 128]),
      width: 1,
      height: 1,
      x: 0,
      y: 0,
      tolerance: 0,
    } as const;
    expect(await processSelection(request)).toEqual({
      id: 3,
      result: { data: new Uint8ClampedArray([255, 255, 255, 128]), width: 1, height: 1 },
    });
    const postMessage = vi.fn();
    vi.stubGlobal("postMessage", postMessage);
    await handleSelection({ data: request } as MessageEvent<typeof request>);
    const response = postMessage.mock.calls[0]![0];
    expect(response.id).toBe(3);
    expect(postMessage.mock.calls[0]![1]).toEqual([response.result.data.buffer]);
  });
  it("prepares the model lazily and forwards model point selections", async () => {
    sam.prepareSam.mockResolvedValue({});
    sam.segmentObject.mockResolvedValue({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
    expect(await processSelection({ id: 1, type: "prepare" })).toEqual({ id: 1, result: null });
    expect(sam.prepareSam).toHaveBeenCalled();
    expect(
      await processSelection({ id: 2, type: "segment", dataUrl: "source", x: 5, y: 6 }),
    ).toMatchObject({ id: 2, result: { width: 1, height: 1 } });
    expect(sam.segmentObject).toHaveBeenCalledWith("source", 5, 6);
    const postMessage = vi.fn();
    vi.stubGlobal("postMessage", postMessage);
    await handleSelection({ data: { id: 7, type: "prepare" } } as MessageEvent);
    expect(postMessage).toHaveBeenCalledWith({ id: 7, result: null }, []);
  });
  it("returns explicit errors without hanging the caller on thrown Error or non-Error values", async () => {
    expect(
      await processSelection({
        id: 1,
        type: "wand",
        pixels: new Uint8ClampedArray(1),
        width: 1,
        height: 1,
        x: 0,
        y: 0,
        tolerance: 0,
      }),
    ).toMatchObject({ id: 1, error: expect.stringContaining("invalides") });
    sam.prepareSam.mockRejectedValueOnce("download stopped");
    expect(await processSelection({ id: 2, type: "prepare" })).toEqual({
      id: 2,
      error: "download stopped",
    });
    const postMessage = vi.fn();
    vi.stubGlobal("postMessage", postMessage);
    sam.prepareSam.mockRejectedValueOnce(new Error("download failed"));
    await handleSelection({ data: { id: 3, type: "prepare" } } as MessageEvent);
    expect(postMessage).toHaveBeenCalledWith({ id: 3, error: "download failed" }, []);
  });
});
