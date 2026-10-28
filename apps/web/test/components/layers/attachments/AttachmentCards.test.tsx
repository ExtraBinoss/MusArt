import { expect, test, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { createEffect, type Effect } from "@musart/core";
import { AttachmentCards } from "../../../../src/components/layers/attachments/AttachmentCards";
import { useEngine } from "../../../../src/state/session/editor";
import { attachmentSelection } from "../../../../src/state/selection/attachments";
import { useAttachmentSelection } from "../../../../src/state/selection/use-attachment-selection";
import type { LayerPreviewVariant } from "../../../../src/state/contracts";
import { setup } from "../../../support/ui";
vi.mock("../../../../src/components/layers/rows/LayerThumbnail", () => ({
  LayerThumbnail: ({ variant, pageId }: { variant?: LayerPreviewVariant; pageId?: string }) => (
    <span
      data-testid="card-preview"
      data-kind={variant?.kind}
      data-effect={variant?.kind === "effect" ? variant.effectId : undefined}
      data-page={pageId}
    />
  ),
}));
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
