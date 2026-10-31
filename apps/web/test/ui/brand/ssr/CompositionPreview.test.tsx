import { afterEach, expect, test, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import "../../../../src/state/i18n";
const state = vi.hoisted(() => ({ create: vi.fn(), read: vi.fn() }));
vi.mock("@musart/render", () => ({ createRenderSession: state.create }));
vi.mock("../../../../src/services/assets/imports", () => ({ readDataUrl: state.read }));
import { CompositionPreview } from "../../../../src/ui/brand/ssr/CompositionPreview";
afterEach(() => vi.unstubAllGlobals());
test("publishes one acknowledged native canvas and disposes its GPU session on unmount", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Blob(["image"]))),
  );
  state.read.mockResolvedValue("data:image/jpeg;base64,AAAA");
  const dispose = vi.fn(async () => {}),
    canvas = document.createElement("canvas");
  state.create.mockReturnValue({
    withCanvasFrame: vi.fn(
      async (_page: unknown, _assets: unknown, consume: (canvas: HTMLCanvasElement) => void) =>
        consume(canvas),
    ),
    dispose,
  });
  const view = render(<CompositionPreview />);
  await waitFor(() =>
    expect(view.container.querySelector('[data-brand-art-status="ready"] canvas')).toBe(canvas),
  );
  expect(state.create).toHaveBeenCalledWith({ maxBytes: 64 * 1024 * 1024 });
  view.unmount();
  await waitFor(() => expect(dispose).toHaveBeenCalledOnce());
});
test("a failed source reports failure and does not allocate a renderer", async () => {
  state.create.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 404 })),
  );
  const view = render(<CompositionPreview />);
  await waitFor(() =>
    expect(view.container.querySelector('[data-brand-art-status="failed"]')).not.toBeNull(),
  );
  expect(state.create).not.toHaveBeenCalled();
});
