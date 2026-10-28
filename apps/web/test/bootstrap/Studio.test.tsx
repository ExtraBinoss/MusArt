import { changeLanguage } from "../../src/state/i18n";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import { createProject, EditorEngine } from "@musart/core";
const mocks = vi.hoisted(() => ({ createRuntime: vi.fn(), attach: vi.fn() }));
vi.mock("../../src/services/session/runtime", () => ({ createRuntime: mocks.createRuntime }));
vi.mock("../../src/services/automation/automation", () => ({ attachAutomation: mocks.attach }));
vi.mock("../../src/App", () => ({
  App: ({ welcome }: { welcome?: boolean }) => (
    <div data-welcome={String(welcome)}>Atelier prêt</div>
  ),
}));
import { Studio } from "../../src/bootstrap/Studio";
const runtime = () => ({
  welcome: false,
  engine: new EditorEngine(createProject()),
  services: {},
  dispose: vi.fn().mockResolvedValue(undefined),
});
it("forwards the memory-only welcome mode to the shared app dashboard", async () => {
  const result = { ...runtime(), welcome: true };
  mocks.createRuntime.mockResolvedValue(result);
  const view = render(<Studio />);
  expect(await screen.findByText("Atelier prêt")).toHaveAttribute("data-welcome", "true");
  view.unmount();
});
beforeEach(() => {
  mocks.createRuntime.mockReset();
  mocks.attach.mockReset();
  history.replaceState(null, "", "/");
});
it("shows startup then mounts editor and closes resources", async () => {
  const result = runtime();
  mocks.createRuntime.mockResolvedValue(result);
  const view = render(<Studio />);
  expect(screen.getByRole("status")).toHaveTextContent("Ouverture");
  await screen.findByText("Atelier prêt");
  view.unmount();
  expect(result.dispose).toHaveBeenCalledOnce();
});
it("shows and dismisses local storage errors without blocking editing", async () => {
  mocks.createRuntime.mockImplementation(async (report: (e: unknown) => void) => {
    report(new Error("Stockage indisponible"));
    return runtime();
  });
  render(<Studio />);
  await screen.findByText("Atelier prêt");
  expect(screen.getByRole("alert")).toHaveTextContent("Stockage indisponible");
  fireEvent.click(screen.getByRole("button", { name: "Fermer le message" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("handles startup rejection and non Error failures", async () => {
  mocks.createRuntime.mockRejectedValue("Refus");
  render(<Studio />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Refus");
});
it("localizes concurrent project-write errors reported during startup", async () => {
  mocks.createRuntime.mockRejectedValue(
    Object.assign(new Error("raw storage diagnostic"), { code: "STALE_PROJECT_WRITE" }),
  );
  render(<Studio />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Ce projet a changé");
  expect(screen.getByRole("alert")).not.toHaveTextContent("raw storage diagnostic");
});
it("disposes runtime that finishes after unmount", async () => {
  let finish!: (result: ReturnType<typeof runtime>) => void;
  mocks.createRuntime.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const view = render(<Studio />);
  view.unmount();
  const result = runtime();
  result.dispose.mockRejectedValue(new Error("late"));
  await act(async () => {
    finish(result);
    await Promise.resolve();
  });
  expect(result.dispose).toHaveBeenCalledOnce();
});
it("enables automation only when explicitly requested, then detaches", async () => {
  history.replaceState(null, "", "/?automation=1");
  const detach = vi.fn();
  mocks.attach.mockReturnValue(detach);
  mocks.createRuntime.mockResolvedValue(runtime());
  const view = render(<Studio />);
  await screen.findByText("Atelier prêt");
  expect(mocks.attach).toHaveBeenCalledOnce();
  view.unmount();
  expect(detach).toHaveBeenCalledOnce();
});

it("translates startup and dismiss controls in English", async () => {
  await changeLanguage("en");
  mocks.createRuntime.mockResolvedValue(runtime());
  const view = render(<Studio />);
  expect(screen.getByRole("status")).toHaveTextContent("Opening your studio");
  await screen.findByText("Atelier prêt");
  view.unmount();
  await changeLanguage("fr");
});

it("cancels an initializing runtime when StrictMode cleans up its first mount", () => {
  mocks.createRuntime.mockReturnValue(new Promise(() => {}));
  const view = render(<Studio />);
  const options = mocks.createRuntime.mock.calls[0]![1] as { signal: AbortSignal };
  expect(options.signal.aborted).toBe(false);
  view.unmount();
  expect(options.signal.aborted).toBe(true);
});
