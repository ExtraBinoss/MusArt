import { Plus, Trash2 } from "lucide-react";
import { useSetAtom } from "jotai";
import { previewAtom } from "../../state/session/editor";
import { createId, type Composition, type EnginePort, type Layer } from "@musart/core";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { IconButton } from "../shared/IconButton";
import { NumberInput } from "../shared/NumberInput";
export function GuidesPanel({
  engine,
  page,
  layer,
  run,
}: {
  engine: EnginePort;
  page: Composition;
  layer?: Layer;
  run: (action: () => void) => void;
}) {
  const { t } = useTranslation();
  const setPreview = useSetAtom(previewAtom);
  const guides = layer ? (layer.guides ?? []) : page.guides;
  const targetId = layer?.id;
  return (
    <section className="inspector-section guides-section">
      <div className="section-title">
        <h3>{t("guides")}</h3>
        {!layer && (
          <Switch
            aria-label={t("showRulers")}
            checked={page.rulers ?? false}
            onCheckedChange={(rulers) =>
              run(() => engine.execute({ type: "updatePage", patch: { rulers } }))
            }
          />
        )}
      </div>
      <div className="guide-actions">
        {(["x", "y"] as const).map((axis) => (
          <Button
            key={axis}
            size="sm"
            variant="outline"
            onClick={() =>
              run(() =>
                engine.execute({
                  type: "addGuide",
                  targetId,
                  guide: {
                    id: createId("guide"),
                    axis,
                    position: (axis === "x" ? (layer ?? page).width : (layer ?? page).height) / 2,
                  },
                }),
              )
            }
          >
            <Plus size={12} />
            {t(axis === "x" ? "addVerticalGuide" : "addHorizontalGuide")}
          </Button>
        ))}
      </div>
      {guides.map((guide) => (
        <div className="guide-row" key={guide.id}>
          <NumberInput
            key={`${guide.id}:${guide.position}`}
            label={`${t(guide.axis === "x" ? "verticalGuide" : "horizontalGuide")} ${guide.axis.toUpperCase()}`}
            value={guide.position}
            unit="px"
            onPreview={(position) => {
              const patch = {
                guides: guides.map((item) => (item.id === guide.id ? { ...item, position } : item)),
              };
              if (layer) setPreview({ target: "layer", layerId: layer.id, patch });
              else setPreview({ target: "page", patch });
            }}
            onCancel={() => setPreview(null)}
            onCommit={(position) => {
              setPreview(null);
              run(() =>
                engine.execute({
                  type: "updateGuide",
                  targetId,
                  id: guide.id,
                  patch: { position },
                }),
              );
            }}
          />
          <IconButton
            label={t("deleteGuide")}
            onClick={() =>
              run(() => engine.execute({ type: "deleteGuide", targetId, id: guide.id }))
            }
          >
            <Trash2 size={13} />
          </IconButton>
        </div>
      ))}
      {guides.length > 0 && (
        <Button
          variant="ghost"
          className="menu-item"
          onClick={() =>
            run(() =>
              engine.transaction(
                guides.map((guide) => ({ type: "deleteGuide", targetId, id: guide.id })),
              ),
            )
          }
        >
          <Trash2 size={13} />
          {t("clearGuides")}
        </Button>
      )}
    </section>
  );
}
