import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useFavorites } from "../../../../src/components/projects/items/use-favorites";
import {
  readLibraryFavorites,
  setLibraryFavorite,
  type LibraryItem,
} from "../../../../src/services/projects/library/favorites";
vi.mock("../../../../src/services/projects/library/favorites", () => ({
  readLibraryFavorites: vi.fn(),
  setLibraryFavorite: vi.fn(),
}));
const item: LibraryItem = { kind: "project", id: "durable", name: "Motion", mode: "motion" };
afterEach(() => vi.unstubAllGlobals());
test("rejects stale reads and closes the cross-window subscription on disposal", async () => {
  const connections: { onmessage?: () => void; close: ReturnType<typeof vi.fn> }[] = [];
  class Channel {
    onmessage?: () => void;
    close = vi.fn();
    postMessage = vi.fn();
    constructor() {
      connections.push(this);
    }
  }
  vi.stubGlobal("BroadcastChannel", Channel);
  let first!: (items: LibraryItem[]) => void;
  vi.mocked(readLibraryFavorites)
    .mockImplementationOnce(() => new Promise((resolve) => (first = resolve)))
    .mockResolvedValueOnce([item]);
  const { result, unmount } = renderHook(useFavorites);
  await act(async () => connections[0]!.onmessage?.());
  expect(result.current.items).toEqual([item]);
  await act(async () => first([]));
  expect(result.current.items).toEqual([item]);
  unmount();
  expect(connections[0]!.close).toHaveBeenCalledOnce();
});
test("reports failed reads, recovers on retry and never presents a failed write as saved", async () => {
  vi.mocked(readLibraryFavorites).mockRejectedValueOnce(Error("Storage unavailable"));
  const { result, unmount } = renderHook(useFavorites);
  await waitFor(() => expect(result.current.error).toBe(true));
  vi.mocked(readLibraryFavorites).mockResolvedValueOnce([item]);
  await act(async () => result.current.refresh());
  expect(result.current.error).toBe(false);
  expect(result.current.items).toEqual([item]);
  vi.mocked(setLibraryFavorite).mockRejectedValueOnce(Error("Quota exceeded"));
  await act(async () => {
    await expect(result.current.toggle(item, false)).rejects.toThrow("Quota exceeded");
  });
  expect(result.current.items).toEqual([item]);
  expect(result.current.saving).toBe(false);
  unmount();
});
