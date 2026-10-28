import { Plus, Trash2 } from "lucide-react";
import { useSetAtom } from "jotai";
import { previewAtom } from "../../state/session/editor";
import {
  createId,
  createLayerGeometryIndex,
  type Composition,
  type EnginePort,
  type Layer,
} from "@musart/core";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { IconButton } from "../shared/IconButton";
import { NumberInput } from "../shared/NumberInput";
import { GuidePresets } from "./guides/GuidePresets";
import { guidesFromPreset } from "./guides/presets";
import { GuideColor } from "./guides/GuideColor";
import { DEFAULT_GUIDE_COLOR, guideColors } from "../../state/guides/colors";
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
  const locked = !!layer && createLayerGeometryIndex(page).isLocked(layer.id);
  function current() {
    const snapshot = engine.getSnapshot();
    return (
      snapshot.pageId === page.id &&
      snapshot.project.pages.find((item) => item.id === page.id) === page
    );
  }
  function edit(action: () => void) {
    if (locked || !current()) return;
    run(() => {
      if (current()) action();
    });
  }
  return (
    <section className="inspector-section guides-section">
      <div className="section-title">
        <h3>{t("guides")}</h3>
        <GuidePresets
          bounds={layer ?? page}
          disabled={locked}
          onAppend={(preset) =>
            edit(() =>
              engine.transaction(
                guidesFromPreset(layer ?? page, preset).map((guide) => ({
                  type: "addGuide",
                  targetId,
                  guide: { ...guide, color: guideColors.read() },
                })),
              ),
            )
          }
        />
      </div>
      {!layer && (
        <div className="switch-row guide-rulers">
          <span>{t("showRulers")}</span>
          <Switch
            size="sm"
            aria-label={t("showRulers")}
            checked={page.rulers ?? false}
            onCheckedChange={(rulers) =>
              edit(() => engine.execute({ type: "updatePage", patch: { rulers } }))
            }
          />
        </div>
      )}
      <div className="guide-actions">
        {(["x", "y"] as const).map((axis) => (
          <Button
            key={axis}
            size="sm"
            variant="outline"
            disabled={locked}
            onClick={() =>
              edit(() =>
                engine.execute({
                  type: "addGuide",
                  targetId,
                  guide: {
                    id: createId("guide"),
                    axis,
                    position: (axis === "x" ? (layer ?? page).width : (layer ?? page).height) / 2,
                    color: guideColors.read(),
                  },
                }),
              )
            }
          >
            <Plus size={12} />
            {t(axis === "x" ? "guidePanel:addVertical" : "guidePanel:addHorizontal")}
          </Button>
        ))}
      </div>
      {(["x", "y"] as const).map((axis) => {
        const entries = guides.filter((guide) => guide.axis === axis);
        return (
          entries.length > 0 && (
            <div className="guide-orientation" key={axis}>
              <h4>{t(axis === "x" ? "guidePanel:vertical" : "guidePanel:horizontal")}</h4>
              {entries.map((guide, index) => (
                <div className="guide-row" key={guide.id}>
                  <GuideColor
                    identity={`${engine.getSnapshot().project.id}:${page.id}:${targetId ?? "page"}:${guide.id}`}
                    value={guide.color ?? DEFAULT_GUIDE_COLOR}
                    disabled={locked}
                    onPreview={(color) => {
                      if (!current() || locked) return;
                      const patch = {
                        guides: guides.map((item) =>
                          item.id === guide.id ? { ...item, color } : item,
                        ),
                      };
                      if (layer) setPreview({ target: "layer", layerId: layer.id, patch });
                      else setPreview({ target: "page", patch });
                    }}
                    onCancel={() => setPreview(null)}
                    onCommit={(color) => {
                      setPreview(null);
                      edit(() => {
                        if (
                          (guide.color ?? DEFAULT_GUIDE_COLOR).toLowerCase() !== color.toLowerCase()
                        )
                          engine.execute({
                            type: "updateGuide",
                            targetId,
                            id: guide.id,
                            patch: { color },
                          });
                        guideColors.remember(color);
                      });
                    }}
                  />
                  <NumberInput
                    identity={guide}
                    label={`${axis.toUpperCase()}${index + 1}`}
                    disabled={locked}
                    value={guide.position}
                    unit="px"
                    onPreview={(position) => {
                      if (locked || !current()) return;
                      const patch = {
                        guides: guides.map((item) =>
                          item.id === guide.id ? { ...item, position } : item,
                        ),
                      };
                      if (layer) setPreview({ target: "layer", layerId: layer.id, patch });
                      else setPreview({ target: "page", patch });
                    }}
                    onCancel={() => setPreview(null)}
                    onCommit={(position) => {
                      setPreview(null);
                      edit(() =>
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
                    disabled={locked}
                    onClick={() =>
                      edit(() => engine.execute({ type: "deleteGuide", targetId, id: guide.id }))
                    }
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </div>
              ))}
            </div>
          )
        );
      })}
      {guides.length > 0 && (
        <Button
          variant="ghost"
          className="menu-item guide-clear"
          disabled={locked}
          onClick={() =>
            edit(() =>
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
