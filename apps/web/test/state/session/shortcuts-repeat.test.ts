import { createElement } from "react";
import { afterEach, expect, test } from "vitest";
import { act, fireEvent, renderHook } from "@testing-library/react";
import { Provider } from "jotai";
import { useShortcuts } from "../../../src/state/session/shortcuts";
import { createCommandPort } from "../../../src/state/keybindings/command-port";
import { keybindings } from "../../../src/state/keybindings/store";
import { setup } from "../../support/ui";
afterEach(() => {
  act(() => keybindings.reset());
  localStorage.clear();
});
test.each(["ctrlKey", "metaKey"] as const)(
  "reserves held %s ruler shortcuts without duplicate commands and still accepts the next press",
  (modifier) => {
    const d = setup();
    const stop = createCommandPort(d.engine).subscribe((id) => {
      if (id !== "action:rulers") return false;
      const page = d.engine.getSnapshot().project.pages[0]!;
      d.engine.execute({ type: "updatePage", patch: { rulers: !page.rulers } });
      return true;
    });
    const hook = renderHook(() => useShortcuts(d.engine, d.services, d.onTask), {
      wrapper: ({ children }) => createElement(Provider, { store: d.store }, children),
    });
    try {
      const before = d.engine.getSnapshot().revision;
      expect(fireEvent.keyDown(document, { key: "r", [modifier]: true })).toBe(false);
      for (let at = 0; at < 40; at++)
        expect(fireEvent.keyDown(document, { key: "r", [modifier]: true, repeat: true })).toBe(
          false,
        );
      expect(d.engine.getSnapshot().revision).toBe(before + 1);
      expect(d.engine.getSnapshot().project.pages[0]!.rulers).toBe(true);
      expect(fireEvent.keyDown(document, { key: "r", [modifier]: true })).toBe(false);
      expect(d.engine.getSnapshot().project.pages[0]!.rulers).toBe(false);
    } finally {
      hook.unmount();
      stop();
    }
  },
);
test("repeat ownership follows custom bindings and editable/captured scopes while arrow nudges still repeat", () => {
  const d = setup();
  keybindings.assign("action:rulers", [{ key: "p", mod: true, alt: true, shift: false }]);
  d.engine.select([d.rectangle.id]);
  const hook = renderHook(() => useShortcuts(d.engine, d.services, d.onTask), {
    wrapper: ({ children }) => createElement(Provider, { store: d.store }, children),
  });
  const input = document.createElement("input"),
    capture = document.createElement("button");
  capture.setAttribute("data-keybinding-capture", "");
  document.body.append(input, capture);
  try {
    expect(fireEvent.keyDown(document, { key: "r", ctrlKey: true, repeat: true })).toBe(true);
    expect(
      fireEvent.keyDown(document, { key: "p", ctrlKey: true, altKey: true, repeat: true }),
    ).toBe(false);
    for (const target of [input, capture])
      expect(
        fireEvent.keyDown(target, { key: "p", ctrlKey: true, altKey: true, repeat: true }),
      ).toBe(true);
    const before = d.engine.getSnapshot().project.pages[0]!.layers[0]!.x;
    fireEvent.keyDown(document, { key: "ArrowRight", repeat: true });
    expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.x).toBe(before + 1);
  } finally {
    input.remove();
    capture.remove();
    hook.unmount();
  }
});
