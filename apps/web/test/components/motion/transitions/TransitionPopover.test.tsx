import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { TransitionPopover } from "../../../../src/components/motion/transitions/TransitionPopover";
import { setup } from "../../../support/ui";
import { makeTransport } from "../support";
import { useSyncExternalStore } from "react";
import type { TransitionPreviewSource } from "../../../../src/components/motion/transitions/preview-source";

const metrics = vi.hoisted(() => ({ selectRenders: vi.fn() }));
vi.mock("../../../../src/components/shared/SelectField", async (load) => {
  const actual = await load<typeof import("../../../../src/components/shared/SelectField")>();
  return {
    ...actual,
    SelectField(props: Parameters<typeof actual.SelectField>[0]) {
      metrics.selectRenders();
      return <actual.SelectField {...props} />;
    },
  };
});
vi.mock("../../../../src/components/motion/transitions/TransitionPreview", () => ({
  TransitionPreview: ({
    style,
    optionActive,
    previewSource,
  }: {
    style: string;
    optionActive: boolean;
    previewSource: TransitionPreviewSource;
  }) => {
    const hovered = useSyncExternalStore(
      previewSource.subscribe,
      previewSource.read,
      previewSource.read,
    );
    return (
      <div
        data-testid="transition-preview"
        data-style={hovered ?? style}
        data-active={String(optionActive || hovered !== null)}
      />
    );
  },
}));

function fixture() {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const page = d.engine.getSnapshot().project.pages[0]!;
  const transport = makeTransport(page).transport;
  d.mount(
    <TransitionPopover
      engine={d.engine}
      compositionId={page.id}
      layerId={d.rectangle.id}
      transport={transport}
    />,
  );
  return { ...d, page };
}

it("keeps drafts local, selects a category/style, and creates editable exit keys in one commit", async () => {
  const d = fixture(),
    user = userEvent.setup();
  const before = d.engine.getSnapshot();
  await user.click(screen.getByRole("button", { name: "Ajouter une transition" }));
  expect(screen.getByRole("dialog", { name: "Transition" })).toBeVisible();
  fireEvent.click(screen.getByRole("radio", { name: "Sortie" }));
  const category = screen.getByRole("combobox", { name: "Catégorie de transition" });
  await user.click(category);
  await user.click(screen.getByRole("option", { name: "Révélations" }));
  const style = screen.getByRole("combobox", { name: "Style de transition" });
  await user.click(style);
  await user.click(screen.getByRole("option", { name: "Iris" }));
  expect(d.engine.getSnapshot()).toBe(before);
  fireEvent.change(screen.getByRole("spinbutton", { name: "Durée" }), { target: { value: "250" } });
  await user.click(
    screen.getByRole("dialog").querySelector<HTMLButtonElement>("footer button:last-child")!,
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  const page = d.engine.getSnapshot().project.pages[0]!;
  expect(page.layers.find(({ id }) => id === d.rectangle.id)!.effects[0]).toMatchObject({
    type: "transition",
    settings: { style: "iris", progress: 1 },
  });
  const keys = page.motion!.tracks.find(({ layerId }) => layerId === d.rectangle.id)!.properties[0]!
    .keyframes;
  expect(keys.map(({ value }) => value)).toEqual([1, 0]);
  expect(keys[0]!.time).toEqual({ value: 7, rate: 4 });
  d.engine.undo();
  expect(d.engine.getSnapshot().project).toEqual(before.project);
});

it("keeps the editor open on empty clicks and rejects invalid duration or a stale document", () => {
  const d = fixture();
  fireEvent.click(screen.getByRole("button", { name: "Ajouter une transition" }));
  fireEvent.click(screen.getByRole("dialog"));
  expect(screen.getByRole("dialog")).toBeVisible();
  const apply = screen
    .getByRole("dialog")
    .querySelector<HTMLButtonElement>("footer button:last-child")!;
  fireEvent.change(screen.getByRole("spinbutton", { name: "Durée" }), {
    target: { value: "9999" },
  });
  fireEvent.click(apply);
  expect(screen.getByRole("alert")).toHaveTextContent("tient dans ce clip");
  fireEvent.change(screen.getByRole("spinbutton", { name: "Durée" }), { target: { value: "500" } });
  d.engine.execute({ type: "renameProject", name: "Another edit" });
  fireEvent.click(apply);
  expect(screen.getByRole("alert")).toHaveTextContent("a changé");
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.effects).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("previews hovered and keyboard-focused choices locally and restores the selected style on dismissal", async () => {
  const d = fixture(),
    user = userEvent.setup(),
    before = d.engine.getSnapshot();
  await user.click(screen.getByRole("button", { name: "Ajouter une transition" }));
  await user.click(screen.getByRole("combobox", { name: "Style de transition" }));
  const beforeHover = metrics.selectRenders.mock.calls.length;
  fireEvent.pointerMove(screen.getByRole("option", { name: "Passage au noir" }), {
    pointerType: "mouse",
  });
  expect(screen.getByTestId("transition-preview")).toHaveAttribute("data-style", "fade-black");
  expect(screen.getByTestId("transition-preview")).toHaveAttribute("data-active", "true");
  expect(metrics.selectRenders).toHaveBeenCalledTimes(beforeHover);
  fireEvent.focus(screen.getByRole("option", { name: "Fondu" }));
  expect(metrics.selectRenders).toHaveBeenCalledTimes(beforeHover);
  await user.keyboard("{Escape}");
  expect(screen.getByTestId("transition-preview")).toHaveAttribute("data-style", "fade");
  expect(screen.getByTestId("transition-preview")).toHaveAttribute("data-active", "false");
  expect(metrics.selectRenders).toHaveBeenCalledTimes(beforeHover);
  expect(d.engine.getSnapshot()).toBe(before);
});
