import { vi } from "vitest";
const mocks = vi.hoisted(() => ({ render: vi.fn(), createRoot: vi.fn() }));
vi.mock("react-dom/client", () => ({ createRoot: mocks.createRoot }));
vi.mock("../src/bootstrap/Studio", () => ({ Studio: () => null }));
beforeEach(() => {
  vi.resetModules();
  mocks.render.mockReset();
  mocks.createRoot.mockReset();
  mocks.createRoot.mockReturnValue({ render: mocks.render });
});
it("mounts strict React on the expected root", async () => {
  document.body.innerHTML = '<div id="root"></div>';
  await import("../src/main");
  expect(mocks.createRoot).toHaveBeenCalledWith(document.getElementById("root"));
  expect(mocks.render).toHaveBeenCalledOnce();
});
it("rejects a missing mount instead of a silent blank screen", async () => {
  document.body.innerHTML = "";
  await expect(import("../src/main")).rejects.toThrow("Point de montage");
});
