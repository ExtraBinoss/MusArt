import { useState, useSyncExternalStore } from "react";
import { ChevronDown, ChevronRight, Copy, Plus, Sparkles, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  addMotionTime,
  captureMotionAnimationPreset,
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
import { AnimationDetails } from "./AnimationDetails";
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
          return (
            <div className="animation-instance" key={animation.id} data-selected={selected}>
              <div className="animation-instance-header">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("details")}
                  aria-expanded={selected}
                  onClick={() =>
                    animationPresentation(engine).set({ selected: selected ? null : animation.id })
                  }
                >
                  {selected ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </Button>
                <button
                  className="animation-instance-name"
                  onClick={() => animationPresentation(engine).set({ selected: animation.id })}
                >
                  {animation.preset.name}
                </button>
                <Switch
                  aria-label={t("enabled")}
                  checked={animation.enabled}
                  disabled={locked}
                  onCheckedChange={(enabled) => update(animation, { enabled })}
                />
              </div>
              {selected && (
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
                      value={animation.strength * 100}
                      min={0}
                      max={1000}
                      unit="%"
                      disabled={locked}
                      onCommit={(value) => update(animation, { strength: value / 100 })}
                    />
                  </div>
                  <div className="animation-instance-actions">
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={locked}
                      onClick={() =>
                        update(animation, {
                          preset: {
                            ...animation.preset,
                            channels: animation.preset.channels.map((channel) => ({
                              ...channel,
                              points: channel.points
                                .map((point) => ({ ...point, at: 1 - point.at }))
                                .reverse(),
                            })),
                          },
                        })
                      }
                    >
                      {t("reverse")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t("duplicate")}
                      disabled={locked}
                      onClick={() =>
                        run(() =>
                          engine.execute({
                            type: "addMotionAnimation",
                            trackId: track.id,
                            preset: animation.preset,
                            start: addMotionTime(animation.start, animation.duration),
                            duration: animation.duration,
                            strength: animation.strength,
                            enabled: animation.enabled,
                          }),
                        )
                      }
                    >
                      <Copy size={12} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t("remove")}
                      disabled={locked}
                      onClick={() =>
                        run(() =>
                          engine.execute({
                            type: "deleteMotionAnimation",
                            animationId: animation.id,
                          }),
                        )
                      }
                    >
                      <Trash2 size={12} />
                    </Button>
                    <SavePreset
                      create={(name, id) =>
                        captureMotionAnimationPreset(page, layerId, animation, name, id)
                      }
                    />
                  </div>
                  <details>
                    <summary>{t("details")}</summary>
                    <fieldset disabled={locked}>
                      <AnimationDetails engine={engine} animation={animation} run={run} />
                    </fieldset>
                  </details>
                </div>
              )}
            </div>
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
