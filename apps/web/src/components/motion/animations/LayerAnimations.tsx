import { AnimatedCollapsibleContent } from "../../shared/disclosure/AnimatedCollapsibleContent";
import { useState, useSyncExternalStore } from "react";
import { ChevronRight, Plus, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  createLayerGeometryIndex,
  extractMotionAnimationPreset,
  motionTimeToSeconds,
  type EnginePort,
  type MotionAnimation,
} from "@musart/core";
import { createMotionTransport } from "../../../services/motion/transport";
import { NumberInput } from "../../shared/NumberInput";
import { Button } from "../../ui/button";
import { Switch } from "../../ui/switch";
import { MotionPopover } from "./MotionPopover";
import { AnimationActions } from "./AnimationActions";
import { TypographyControls } from "./TypographyControls";
import { AnimationDetailsDisclosure } from "./AnimationDetails";
import { Collapsible, CollapsibleTrigger } from "../../ui/collapsible";
import { SavePreset } from "./SavePreset";
import { animationPresentation, useAnimationPresentation } from "./presentation";
import "./messages";
import "./animations.css";

export function LayerAnimations({ engine, layerId }: { engine: EnginePort; layerId: string }) {
  const { t } = useTranslation("animations");
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  const presentation = useAnimationPresentation(engine);
  const [error, setError] = useState(false);
  const page = snapshot.project.pages.find((page) => page.id === snapshot.pageId)!;
  const tracks = page.motion?.tracks.filter((track) => track.layerId === layerId) ?? [];
  const locked = createLayerGeometryIndex(page).isLocked(layerId);
  if (page.motion?.mode !== "motion") return null;
  function run(action: () => void) {
    if (locked || engine.getSnapshot().project !== snapshot.project) return;
    try {
      action();
      setError(false);
    } catch {
      setError(true);
    }
  }
  function update(
    animation: MotionAnimation,
    patch: Partial<Pick<MotionAnimation, "start" | "duration" | "strength" | "enabled" | "preset">>,
  ) {
    run(() => engine.execute({ type: "updateMotionAnimation", animationId: animation.id, patch }));
  }
  return (
    <section className="inspector-section layer-animations" aria-label={t("title")}>
      <div className="section-title">
        <h3>
          <Sparkles size={13} />
          {t("title")}
        </h3>
        <MotionPopover
          key={`${snapshot.project.id}:${page.id}:${layerId}`}
          engine={engine}
          compositionId={page.id}
          layerId={layerId}
          transport={createMotionTransport(engine)}
          disabled={locked}
          trigger={
            <Button variant="ghost" size="icon-xs" aria-label={t("add")} disabled={locked}>
              <Plus size={14} />
            </Button>
          }
        />
      </div>
      {!tracks.some((track) => track.animations?.length) && (
        <p className="muted-description">{t("empty")}</p>
      )}
      {tracks.flatMap((track) =>
        (track.animations ?? []).map((animation) => {
          const selected = presentation.selected === animation.id;
          const subject = page.layers.find((layer) => layer.id === layerId)!;
          const geometryEffect = subject.effects.find(
            (effect) => effect.type === "morph" && animation.effectIds.includes(effect.id),
          );
          return (
            <Collapsible
              className="animation-instance"
              key={animation.id}
              data-selected={selected}
              open={selected}
              onOpenChange={(open) =>
                animationPresentation(engine).set({ selected: open ? animation.id : null })
              }
            >
              <div className="animation-instance-header">
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="animation-disclosure-trigger"
                    aria-label={`${t("details")} · ${animation.preset.name}`}
                  >
                    <ChevronRight size={12} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleTrigger asChild>
                  <button className="animation-instance-name">{animation.preset.name}</button>
                </CollapsibleTrigger>
                <Switch
                  aria-label={t("enabled")}
                  checked={animation.enabled}
                  disabled={locked}
                  onCheckedChange={(enabled) => update(animation, { enabled })}
                />
              </div>
              <AnimatedCollapsibleContent open={selected} className="animation-disclosure">
                <div className="animation-instance-body">
                  <div className="animation-instance-fields">
                    <NumberInput
                      identity={animation}
                      label={t("start")}
                      value={motionTimeToSeconds(animation.start) * 1000}
                      min={0}
                      max={3600000}
                      unit="ms"
                      disabled={locked}
                      onCommit={(value) =>
                        update(animation, { start: { value: Math.round(value), rate: 1000 } })
                      }
                    />
                    <NumberInput
                      identity={animation}
                      label={t("duration")}
                      value={motionTimeToSeconds(animation.duration) * 1000}
                      min={1}
                      max={3600000}
                      unit="ms"
                      disabled={locked}
                      onCommit={(value) =>
                        update(animation, { duration: { value: Math.round(value), rate: 1000 } })
                      }
                    />
                    <NumberInput
                      identity={animation}
                      label={t("intensity")}
                      value={(geometryEffect?.amount ?? animation.strength) * 100}
                      min={0}
                      max={geometryEffect ? 100 : 1000}
                      unit="%"
                      disabled={locked}
                      onCommit={(value) =>
                        geometryEffect
                          ? run(() =>
                              engine.execute({
                                type: "updateLayerPatches",
                                patches: [
                                  {
                                    id: subject.id,
                                    patch: {
                                      effects: subject.effects.map((effect) =>
                                        effect.id === geometryEffect.id
                                          ? { ...effect, amount: value / 100 }
                                          : effect,
                                      ),
                                    },
                                  },
                                ],
                              }),
                            )
                          : update(animation, { strength: value / 100 })
                      }
                    />
                  </div>
                  <TypographyControls
                    engine={engine}
                    layer={page.layers.find((layer) => layer.id === layerId)!}
                    animation={animation}
                    run={run}
                    disabled={locked}
                  />
                  <AnimationDetailsDisclosure
                    engine={engine}
                    animation={animation}
                    run={run}
                    disabled={locked}
                    actions={
                      <AnimationActions
                        engine={engine}
                        page={page}
                        layerId={layerId}
                        trackId={track.id}
                        animation={animation}
                        run={run}
                        disabled={locked}
                      />
                    }
                  />
                </div>
              </AnimatedCollapsibleContent>
            </Collapsible>
          );
        }),
      )}
      {tracks
        .filter((track) => track.properties.some((property) => property.keyframes.length >= 2))
        .map((track) => (
          <SavePreset
            key={track.id}
            label={t("saveTimeline")}
            create={(name, id) => extractMotionAnimationPreset(page, track, name, id)}
          />
        ))}
      {error && <p role="alert">{t("applyFailed")}</p>}
    </section>
  );
}
