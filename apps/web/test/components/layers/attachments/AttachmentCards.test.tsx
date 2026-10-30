import { expect, test, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { createEffect, type Effect } from "@musart/core";
import { AttachmentCards } from "../../../../src/components/layers/attachments/AttachmentCards";
import { previewAtom, useEngine } from "../../../../src/state/session/editor";
import { attachmentSelection } from "../../../../src/state/selection/attachments";
import { useAttachmentSelection } from "../../../../src/state/selection/use-attachment-selection";
import type { LayerPreviewVariant } from "../../../../src/state/contracts";
import { setup } from "../../../support/ui";
const previews = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock("../../../../src/components/layers/rows/LayerThumbnail", async () => {
  const { memo } = await import("react");
  return {
    // The real thumbnail is memoized too; retain that boundary around local popover updates.
    LayerThumbnail: memo(
      ({ variant, pageId }: { variant?: LayerPreviewVariant; pageId?: string }) => {
        previews.render();
        return (
          <span
            data-testid="card-preview"
            data-kind={variant?.kind}
            data-effect={variant?.kind === "effect" ? variant.effectId : undefined}
            data-page={pageId}
          />
        );
      },
    ),
  };
});
function fixture() {
  const d = setup(),
    effects: Effect[] = Array.from({ length: 12 }, (_unused, index) =>
      createEffect(index === 0 ? "dither" : "contrast", { id: `card-effect-${index}` }),
    ),
    onExpand = vi.fn();
  d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { effects } });
  d.engine.execute({ type: "attachLayerMask", sourceId: d.image.id, targetId: d.rectangle.id });
  d.engine.load(d.engine.getSnapshot().project);
  function Live() {
    const snapshot = useEngine(d.engine),
      target = useAttachmentSelection(d.engine),
      page = snapshot.project.pages[0]!,
      layer = page.layers[0]!;
    return (
      <AttachmentCards
        engine={d.engine}
        page={page}
        layer={layer}
        assets={snapshot.project.assets}
        previewKey="owner"
        target={target}
        onExpand={onExpand}
        run={d.run}
      />
    );
  }
  d.mount(<Live />);
  return { ...d, effects, onExpand };
}
test("shows at most two actual FX variants and the actual mask while exposing every remaining child", () => {
  const d = fixture(),
    previews = screen.getAllByTestId("card-preview"),
    page = d.engine.getSnapshot().project.pages[0]!;
  expect(previews).toHaveLength(3);
  expect(previews.map((node) => node.dataset.kind)).toEqual(["effect", "effect", "mask"]);
  for (const preview of previews) expect(preview).toHaveAttribute("data-page", page.id);
  fireEvent.click(screen.getByRole("button", { name: "Afficher 10 autres effets" }));
  expect(d.onExpand).toHaveBeenCalledOnce();
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  act(() => {
    attachmentSelection(d.engine).select(page, {
      kind: "effect",
      pageId: page.id,
      layerId: d.rectangle.id,
      effectId: d.effects[0]!.id,
    });
  });
  expect(screen.getAllByTestId("card-preview").map((node) => node.dataset.effect)).toContain(
    d.effects[0]!.id,
  );
  expect(screen.getByRole("button", { name: "Dither · Rectangle bleu" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: "Masque · Rectangle bleu" })).toBeInTheDocument();
});
test("context selection targets its exact card without creating document history", () => {
  const d = fixture(),
    before = d.engine.getSnapshot().project,
    mask = screen.getByRole("button", { name: "Masque · Rectangle bleu" });
  fireEvent.contextMenu(mask);
  expect(attachmentSelection(d.engine).read()).toMatchObject({
    kind: "mask",
    layerId: d.rectangle.id,
  });
  const fx = document.querySelector('[data-attachment-effect-id="card-effect-11"]')!;
  fireEvent.contextMenu(fx);
  expect(attachmentSelection(d.engine).read()).toMatchObject({
    kind: "effect",
    effectId: "card-effect-11",
  });
  expect(d.engine.getSnapshot().project).toBe(before);
  expect(d.engine.getSnapshot().selection).toEqual([d.rectangle.id]);
});

function retainedCards() {
  const d = setup();
  d.engine.execute({
    type: "updateLayers",
    ids: [d.rectangle.id],
    patch: { effects: [createEffect("dither")] },
  });
  d.engine.execute({ type: "attachLayerMask", sourceId: d.image.id, targetId: d.rectangle.id });
  d.engine.load(d.engine.getSnapshot().project);
  const page = d.engine.getSnapshot().project.pages[0]!;
  const props = {
    engine: d.engine,
    page,
    layer: page.layers[0]!,
    assets: d.engine.getSnapshot().project.assets,
    previewKey: "retained",
    target: null,
    onExpand: vi.fn(),
    run: d.run,
  };
  const view = d.mount(<AttachmentCards {...props} />);
  return { ...d, props, view };
}

test("closed cards skip metadata renders and resolve current canonical context targets", () => {
  previews.render.mockClear();
  const d = retainedCards();
  const mountedPreviews = screen.getAllByTestId("card-preview");
  expect(mountedPreviews).toHaveLength(2);
  // Radix settles its trigger/virtual anchor at mount; metadata must do no further work.
  previews.render.mockClear();
  act(() => d.engine.execute({ type: "updatePage", patch: { rulers: true } }));
  d.view.rerender(<AttachmentCards {...d.props} page={d.engine.getSnapshot().project.pages[0]!} />);
  expect(previews.render).not.toHaveBeenCalled();
  expect(screen.getAllByTestId("card-preview")).toEqual(mountedPreviews);
  fireEvent.contextMenu(screen.getByRole("button", { name: "Masque · Rectangle bleu" }));
  expect(attachmentSelection(d.engine).editable()).toBe(true);
  fireEvent.contextMenu(screen.getByRole("button", { name: "Dither · Rectangle bleu" }));
  expect(attachmentSelection(d.engine).editable()).toBe(true);
  expect(attachmentSelection(d.engine).read()?.kind).toBe("effect");
  act(() => d.engine.load(d.engine.getSnapshot().project));
  const replacement = d.engine.getSnapshot();
  fireEvent.contextMenu(screen.getByRole("button", { name: "Masque · Rectangle bleu" }));
  fireEvent.click(screen.getByRole("button", { name: "Dither · Rectangle bleu" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(d.engine.getSnapshot()).toBe(replacement);
  expect(attachmentSelection(d.engine).editable()).toBe(false);
});

test("an open effect follows ruler metadata even when its closed card owner was retained", () => {
  const d = retainedCards();
  act(() => d.engine.execute({ type: "updatePage", patch: { rulers: true } }));
  fireEvent.click(screen.getByRole("button", { name: "Dither · Rectangle bleu" }));
  const amount = screen.getByLabelText("Intensité");
  act(() => d.engine.execute({ type: "updatePage", patch: { rulers: false } }));
  expect(screen.getByLabelText("Intensité")).toBe(amount);
  const before = d.engine.getSnapshot();
  fireEvent.pointerDown(amount, { button: 0 });
  fireEvent.focus(amount);
  fireEvent.change(amount, { target: { value: "60" } });
  expect(d.store.get(previewAtom)).toMatchObject({
    target: "layers",
    patch: { effects: [expect.objectContaining({ amount: 0.6 })] },
  });
  expect(d.engine.getSnapshot().project).toBe(before.project);
  expect(d.engine.getSnapshot().revision).toBe(before.revision);
  fireEvent.blur(amount);
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.amount).toBe(0.6);
  expect(d.engine.getSnapshot().revision).toBe(before.revision + 1);
  expect(d.store.get(previewAtom)).toBeNull();
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before.project);
});

test("an open mask follows ruler metadata without donating an old queued command", () => {
  const d = retainedCards();
  let pending: (() => void) | undefined;
  d.view.rerender(
    <AttachmentCards
      {...d.props}
      run={(task) => {
        pending = task;
      }}
    />,
  );
  act(() => d.engine.execute({ type: "updatePage", patch: { rulers: true } }));
  fireEvent.click(screen.getByRole("button", { name: "Masque · Rectangle bleu" }));
  act(() => d.engine.execute({ type: "updatePage", patch: { rulers: false } }));
  fireEvent.click(screen.getByLabelText("Inverser le masque"));
  act(() => d.engine.execute({ type: "updatePage", patch: { rulers: true } }));
  const intervening = d.engine.getSnapshot();
  act(() => pending!());
  expect(d.engine.getSnapshot()).toBe(intervening);
  const before = d.engine.getSnapshot();
  fireEvent.click(screen.getByLabelText("Inverser le masque"));
  act(() => pending!());
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.mask?.inverted).toBe(true);
  expect(d.engine.getSnapshot().revision).toBe(before.revision + 1);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before.project);
});
