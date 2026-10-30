import { afterEach, expect, test, vi } from "vitest";
import { act, screen, fireEvent, waitFor } from "@testing-library/react";
import { ColorControl } from "../../../src/components/properties/ColorControl";
import { setup } from "../../support/ui";
afterEach(() => vi.unstubAllGlobals());
test("disabled controls abort sampling, block previews/commits and disable native widgets", async () => {
  const { mount } = setup(),
    preview = vi.fn(),
    commit = vi.fn(),
    cancel = vi.fn();
  let resolve!: (value: { sRGBHex: string }) => void;
  const open = vi.fn<(options: { signal: AbortSignal }) => Promise<{ sRGBHex: string }>>(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal(
    "EyeDropper",
    class {
      open = open;
    },
  );
  const { rerender } = mount(
    <ColorControl value="#3366ff80" onPreview={preview} onCommit={commit} onCancel={cancel} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Prélever une couleur à l’écran" }));
  rerender(
    <ColorControl
      disabled
      value="#3366ff80"
      onPreview={preview}
      onCommit={commit}
      onCancel={cancel}
    />,
  );
  expect(open.mock.calls[0]![0].signal.aborted).toBe(true);
  expect(screen.getByLabelText("Couleur hexadécimale")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Prélever une couleur à l’écran" })).toBeDisabled();
  expect(document.querySelector(".color-channels")).toHaveAttribute("inert");
  fireEvent.keyDown(document.querySelector('.color-hue [role="slider"]')!, { key: "ArrowDown" });
  fireEvent.pointerUp(screen.getByLabelText("Couleur hexadécimale"));
  await act(async () => {
    resolve({ sRGBHex: "#ff0000" });
    await Promise.resolve();
  });
  expect(preview).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalled();
});
test("previews hex input and commits only after gesture, preserving alpha", () => {
  const { mount } = setup();
  const preview = vi.fn();
  const commit = vi.fn();
  const cancel = vi.fn();
  mount(<ColorControl value="#3366ffff" onPreview={preview} onCommit={commit} onCancel={cancel} />);
  const input = screen.getByLabelText("Couleur hexadécimale");
  fireEvent.change(input, { target: { value: "#ff00ff80" } });
  expect(preview).toHaveBeenCalledWith("#ff00ff80");
  expect(commit).not.toHaveBeenCalled();
  fireEvent.pointerUp(input);
  expect(commit).toHaveBeenCalledWith("#ff00ff80");
  fireEvent.keyUp(input, { key: "Enter" });
  fireEvent.blur(input);
  expect(commit).toHaveBeenCalledOnce();
});
test("native screen sampling is explicit and preserves the chosen alpha in one commit", async () => {
  const { mount } = setup(),
    commit = vi.fn(),
    preview = vi.fn(),
    open = vi.fn().mockResolvedValue({ sRGBHex: "#ff6600" });
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal(
    "EyeDropper",
    class {
      open = open;
    },
  );
  mount(
    <ColorControl value="#3366ff80" onPreview={preview} onCommit={commit} onCancel={vi.fn()} />,
  );
  expect(open).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Prélever une couleur à l’écran" }));
  await waitFor(() => expect(commit).toHaveBeenCalledExactlyOnceWith("#ff660080"));
  expect(preview).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Couleur hexadécimale")).toHaveValue("#FF660080");
});
test("aborts native requests on changed controls, rejects stale results and cleans up on unmount", async () => {
  const { mount } = setup(),
    commit = vi.fn(),
    nextCommit = vi.fn();
  let resolve!: (value: { sRGBHex: string }) => void;
  const open = vi.fn<(options: { signal: AbortSignal }) => Promise<{ sRGBHex: string }>>(
    () =>
      new Promise<{ sRGBHex: string }>((done) => {
        resolve = done;
      }),
  );
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal(
    "EyeDropper",
    class {
      open = open;
    },
  );
  const { rerender, unmount } = mount(
    <ColorControl value="#3366ff80" onPreview={vi.fn()} onCommit={commit} onCancel={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Prélever une couleur à l’écran" }));
  const firstSignal = open.mock.calls[0]![0] as unknown as { signal: AbortSignal };
  rerender(
    <ColorControl value="#0000ff" onPreview={vi.fn()} onCommit={nextCommit} onCancel={vi.fn()} />,
  );
  expect(firstSignal.signal.aborted).toBe(true);
  await act(async () => {
    resolve({ sRGBHex: "#112233" });
    await Promise.resolve();
  });
  expect(commit).not.toHaveBeenCalled();
  expect(nextCommit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Prélever une couleur à l’écran" }));
  const secondSignal = open.mock.calls[1]![0] as unknown as { signal: AbortSignal };
  unmount();
  expect(secondSignal.signal.aborted).toBe(true);
  await act(async () => {
    resolve({ sRGBHex: "#abcdef" });
    await Promise.resolve();
  });
  expect(nextCommit).not.toHaveBeenCalled();
});
test("manual editing cancels pending sampling, while native cancellation is silent and real errors are visible", async () => {
  const { mount } = setup(),
    commit = vi.fn();
  let resolve!: (value: { sRGBHex: string }) => void;
  const open = vi
    .fn<(options: { signal: AbortSignal }) => Promise<{ sRGBHex: string }>>()
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    )
    .mockRejectedValueOnce(new DOMException("Cancelled", "AbortError"))
    .mockResolvedValueOnce({ sRGBHex: "invalid" })
    .mockRejectedValueOnce(new Error("blocked"));
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal(
    "EyeDropper",
    class {
      open = open;
    },
  );
  mount(
    <ColorControl value="#3366ff80" onPreview={vi.fn()} onCommit={commit} onCancel={vi.fn()} />,
  );
  const sample = screen.getByRole("button", { name: "Prélever une couleur à l’écran" }),
    input = screen.getByLabelText("Couleur hexadécimale");
  fireEvent.click(sample);
  fireEvent.change(input, { target: { value: "#abcdef80" } });
  expect(open.mock.calls[0]![0].signal.aborted).toBe(true);
  await act(async () => {
    resolve({ sRGBHex: "#112233" });
    await Promise.resolve();
  });
  expect(commit).not.toHaveBeenCalled();
  fireEvent.pointerUp(input);
  expect(commit).toHaveBeenCalledExactlyOnceWith("#abcdef80");
  fireEvent.click(sample);
  await waitFor(() => expect(sample).not.toBeDisabled());
  expect(screen.queryByText("Le prélèvement a échoué. Réessayez.")).not.toBeInTheDocument();
  for (let index = 0; index < 2; index++) {
    fireEvent.click(sample);
    await waitFor(() =>
      expect(screen.getByText("Le prélèvement a échoué. Réessayez.")).toBeVisible(),
    );
  }
  expect(commit).toHaveBeenCalledOnce();
});
test("cancels invalid values, Escape and cancelled pointer; keyboard color changes preview", () => {
  const { mount } = setup();
  const preview = vi.fn();
  const commit = vi.fn();
  const cancel = vi.fn();
  mount(<ColorControl value="#3366ff" onPreview={preview} onCommit={commit} onCancel={cancel} />);
  const input = screen.getByLabelText("Couleur hexadécimale");
  fireEvent.change(input, { target: { value: "invalid" } });
  fireEvent.blur(input);
  expect(cancel).toHaveBeenCalledOnce();
  expect(input).toHaveValue("#3366FF");
  fireEvent.keyDown(input, { key: "Escape" });
  fireEvent.pointerCancel(input);
  expect(cancel).toHaveBeenCalledTimes(3);
  fireEvent.keyDown(screen.getByRole("slider", { name: "Teinte" }), {
    key: "ArrowRight",
    keyCode: 39,
    which: 39,
  });
  expect(preview).toHaveBeenCalled();
  fireEvent.keyUp(screen.getByRole("slider", { name: "Teinte" }), {
    key: "ArrowRight",
    keyCode: 39,
    which: 39,
  });
  fireEvent.keyUp(input, { key: "ArrowRight" });
  expect(commit).toHaveBeenCalled();
  fireEvent.keyUp(input, { key: "a" });
});

test("RGB-only effect palettes hide alpha and normalize pasted alpha without leaking unsupported settings", () => {
  const d = setup(),
    preview = vi.fn(),
    commit = vi.fn();
  d.mount(
    <ColorControl
      value="#3366ff"
      alpha={false}
      onPreview={preview}
      onCommit={commit}
      onCancel={vi.fn()}
    />,
  );
  expect(document.querySelector(".color-alpha")).toBeNull();
  const input = screen.getByLabelText("Couleur hexadécimale");
  fireEvent.change(input, { target: { value: "#abcdef80" } });
  expect(preview).toHaveBeenCalledWith("#abcdef");
  fireEvent.pointerUp(input);
  expect(commit).toHaveBeenCalledWith("#abcdef");
});

test("selection/value changes retain genuine slider elements, reset drafts and cancel an abandoned held gesture", () => {
  const d = setup(),
    preview = vi.fn(),
    commit = vi.fn(),
    cancel = vi.fn();
  const view = d.mount(
    <ColorControl
      identity="first"
      value="#3366ff"
      onPreview={preview}
      onCommit={commit}
      onCancel={cancel}
    />,
  );
  const hue = screen.getByRole("slider", { name: "Teinte" }),
    alpha = screen.getByRole("slider", { name: "Transparence" });
  fireEvent.keyDown(hue, { key: "ArrowDown" });
  expect(preview).toHaveBeenCalled();
  fireEvent.pointerDown(hue, { button: 0, pointerId: 1 });
  view.rerender(
    <ColorControl
      identity="second"
      value="#ff000080"
      onPreview={preview}
      onCommit={commit}
      onCancel={cancel}
    />,
  );
  expect(screen.getByRole("slider", { name: "Teinte" })).toBe(hue);
  expect(screen.getByRole("slider", { name: "Transparence" })).toBe(alpha);
  expect(screen.getByLabelText("Couleur hexadécimale")).toHaveValue("#FF000080");
  expect(cancel).toHaveBeenCalled();
  const previousCalls = preview.mock.calls.length;
  fireEvent.blur(screen.getByLabelText("Couleur hexadécimale"));
  fireEvent.keyDown(hue, { key: "ArrowDown" });
  expect(preview).toHaveBeenCalledTimes(previousCalls);
  fireEvent.pointerUp(window, { pointerId: 2 });
  fireEvent.keyDown(hue, { key: "ArrowDown" });
  expect(preview).toHaveBeenCalledTimes(previousCalls);
  fireEvent.pointerUp(window, { pointerId: 1 });
  expect(commit).not.toHaveBeenCalled();
  view.rerender(
    <ColorControl
      identity="first"
      value="#3366ff"
      onPreview={preview}
      onCommit={commit}
      onCancel={cancel}
    />,
  );
  expect(screen.getByRole("slider", { name: "Teinte" })).toBe(hue);
  expect(hue).toHaveAttribute("aria-valuenow", "225");
});

test("fresh callbacks for the same owner preserve a held draft and commit through the latest handler", () => {
  const d = setup(),
    previousCommit = vi.fn(),
    latestCommit = vi.fn(),
    cancel = vi.fn();
  const view = d.mount(
    <ColorControl
      identity="paint"
      value="#3366ff"
      onPreview={vi.fn()}
      onCommit={previousCommit}
      onCancel={cancel}
    />,
  );
  const hue = screen.getByRole("slider", { name: "Teinte" }),
    input = screen.getByLabelText("Couleur hexadécimale");
  fireEvent.pointerDown(hue, { button: 0 });
  fireEvent.change(input, { target: { value: "#abcdef" } });
  view.rerender(
    <ColorControl
      identity="paint"
      value="#3366ff"
      onPreview={vi.fn()}
      onCommit={latestCommit}
      onCancel={cancel}
    />,
  );
  expect(input).toHaveValue("#ABCDEF");
  expect(cancel).not.toHaveBeenCalled();
  fireEvent.pointerUp(hue);
  expect(previousCommit).not.toHaveBeenCalled();
  expect(latestCommit).toHaveBeenCalledExactlyOnceWith("#abcdef");
});

test("normal slider capture release before bubbling pointerup preserves the final draft", () => {
  const d = setup(),
    commit = vi.fn(),
    cancel = vi.fn();
  d.mount(<ColorControl value="#3366ff" onPreview={vi.fn()} onCommit={commit} onCancel={cancel} />);
  const hue = screen.getByRole("slider", { name: "Teinte" }),
    input = screen.getByLabelText("Couleur hexadécimale");
  hue.addEventListener("pointerup", () => {
    // Mirrors Radix's releasePointerCapture before the parent's bubble handler.
    hue.dispatchEvent(new Event("lostpointercapture", { bubbles: true }));
  });
  fireEvent.pointerDown(hue, { button: 0 });
  fireEvent.change(input, { target: { value: "#aabbcc80" } });
  fireEvent.pointerUp(hue);
  expect(commit).toHaveBeenCalledExactlyOnceWith("#aabbcc80");
  expect(cancel).not.toHaveBeenCalled();
});

test("unexpected capture loss cancels without committing a later release", () => {
  const d = setup(),
    commit = vi.fn(),
    cancel = vi.fn();
  d.mount(<ColorControl value="#3366ff" onPreview={vi.fn()} onCommit={commit} onCancel={cancel} />);
  const hue = screen.getByRole("slider", { name: "Teinte" }),
    input = screen.getByLabelText("Couleur hexadécimale");
  fireEvent.pointerDown(hue, { button: 0 });
  fireEvent.change(input, { target: { value: "#aabbcc" } });
  fireEvent.lostPointerCapture(hue);
  expect(input).toHaveValue("#3366FF");
  expect(cancel).toHaveBeenCalledOnce();
  fireEvent.pointerUp(hue);
  expect(commit).not.toHaveBeenCalled();
});

test("unmounting an unfinished typed color restores its preview without saving it", () => {
  const d = setup(),
    commit = vi.fn(),
    preview = vi.fn(),
    cancel = vi.fn();
  const view = d.mount(
    <ColorControl value="#3366ff" onPreview={preview} onCommit={commit} onCancel={cancel} />,
  );
  fireEvent.change(screen.getByLabelText("Couleur hexadécimale"), { target: { value: "#abcdef" } });
  expect(preview).toHaveBeenCalledExactlyOnceWith("#abcdef");
  view.unmount();
  expect(cancel).toHaveBeenCalledOnce();
  expect(commit).not.toHaveBeenCalled();
});

test("window blur cancels an active thumb drag and its later release cannot save it", () => {
  const d = setup(),
    commit = vi.fn(),
    cancel = vi.fn();
  d.mount(<ColorControl value="#3366ff" onPreview={vi.fn()} onCommit={commit} onCancel={cancel} />);
  const hue = screen.getByRole("slider", { name: "Teinte" }),
    input = screen.getByLabelText("Couleur hexadécimale");
  fireEvent.pointerDown(hue, { button: 0 });
  fireEvent.change(input, { target: { value: "#abcdef" } });
  fireEvent(window, new Event("blur"));
  expect(input).toHaveValue("#3366FF");
  expect(cancel).toHaveBeenCalledOnce();
  fireEvent.pointerUp(hue);
  expect(commit).not.toHaveBeenCalled();
});
