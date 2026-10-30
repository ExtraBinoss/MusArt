import { useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { Copy, Pencil, Play, Pause, RotateCcw, Save, Sparkles, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  addMotionTime,
  captureMotionAnimationPreset,
  type Composition,
  type EnginePort,
  type MotionAnimation,
  type SessionSnapshot,
} from "@musart/core";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../../ui/context-menu";
import { Popover, PopoverAnchor, PopoverContent } from "../../ui/popover";
import { getTransitionRequests, requestLayerTransition } from "../transitions/requests";
import type { TimelineTransport } from "../model";
import { SavePreset } from "./SavePreset";
import { animationPresentation } from "./presentation";

/** An animation menu always edits its captured instance, independently of the layer clipboard. */
export function AnimationContextMenu({
  engine,
  page,
  layerId,
  trackId,
  animation,
  transport,
  disabled,
  children,
}: {
  engine: EnginePort;
  page: Composition;
  layerId: string;
  trackId: string;
  animation: MotionAnimation;
  transport: TimelineTransport;
  disabled: boolean;
  children: ReactElement;
}) {
  const { t } = useTranslation("animations");
  const [save, setSave] = useState<{ x: number; y: number } | null>(null),
    [error, setError] = useState(false);
  const origin = useRef<SessionSnapshot | null>(null),
    point = useRef({ x: 0, y: 0 }),
    pendingSave = useRef(false);
  function current() {
    const snapshot = engine.getSnapshot(),
      before = origin.current;
    return (
      !!before &&
      snapshot.project === before.project &&
      snapshot.revision === before.revision &&
      snapshot.pageId === page.id
    );
  }
  function run(action: () => void) {
    if (disabled || !current()) return;
    try {
      action();
      setError(false);
    } catch {
      setError(true);
    }
  }
  return (
    <>
      <ContextMenu
        modal={false}
        onOpenChange={(open) => {
          if (!open) return;
          transport.pause();
          engine.select([layerId]);
          animationPresentation(engine).set({ selected: animation.id });
          origin.current = engine.getSnapshot();
        }}
      >
        <ContextMenuTrigger
          asChild
          disabled={disabled}
          onContextMenu={(event) => {
            point.current = { x: event.clientX, y: event.clientY };
          }}
        >
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent
          data-canvas-control
          data-keybinding-capture
          onCloseAutoFocus={(event) => {
            if (pendingSave.current) {
              pendingSave.current = false;
              event.preventDefault();
              if (current()) setSave({ ...point.current });
            } else if (getTransitionRequests(engine).read()) event.preventDefault();
          }}
        >
          <ContextMenuItem
            onSelect={() =>
              run(() => animationPresentation(engine).set({ selected: animation.id }))
            }
          >
            <Pencil size={14} />
            {t("editing")}
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() =>
              run(() => {
                void requestLayerTransition(engine, page.id, layerId, point.current, trackId).catch(
                  () => setError(true),
                );
              })
            }
          >
            <Sparkles size={14} />
            {t("add")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() =>
              run(() =>
                engine.execute({
                  type: "updateMotionAnimation",
                  animationId: animation.id,
                  patch: { enabled: !animation.enabled },
                }),
              )
            }
          >
            {animation.enabled ? <Pause size={14} /> : <Play size={14} />}
            {t(animation.enabled ? "disable" : "enabled")}
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() =>
              run(() =>
                engine.execute({
                  type: "updateMotionAnimation",
                  animationId: animation.id,
                  patch: {
                    preset: {
                      ...animation.preset,
                      channels: animation.preset.channels.map((channel) => ({
                        ...channel,
                        points: channel.points
                          .map((point) => ({ ...point, at: 1 - point.at }))
                          .reverse(),
                      })),
                    },
                  },
                }),
              )
            }
          >
            <RotateCcw size={14} />
            {t("reverse")}
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() =>
              run(() =>
                engine.execute({
                  type: "addMotionAnimation",
                  trackId,
                  preset: captureMotionAnimationPreset(
                    page,
                    layerId,
                    animation,
                    animation.preset.name,
                    animation.preset.id,
                    { bakeStrength: false },
                  ),
                  start: addMotionTime(animation.start, animation.duration),
                  duration: animation.duration,
                  strength: animation.strength,
                  enabled: animation.enabled,
                }),
              )
            }
          >
            <Copy size={14} />
            {t("duplicate")}
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              if (current()) pendingSave.current = true;
            }}
          >
            <Save size={14} />
            {t("save")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onSelect={() =>
              run(() =>
                engine.execute({ type: "deleteMotionAnimation", animationId: animation.id }),
              )
            }
          >
            <Trash2 size={14} />
            {t("remove")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {save && (
        <Popover
          open
          onOpenChange={(open) => {
            if (!open) setSave(null);
          }}
        >
          {createPortal(
            <PopoverAnchor asChild>
              <span
                aria-hidden
                style={{
                  position: "fixed",
                  left: save.x,
                  top: save.y,
                  width: 1,
                  height: 1,
                  pointerEvents: "none",
                }}
              />
            </PopoverAnchor>,
            document.body,
          )}
          <PopoverContent
            aria-label={t("save")}
            data-canvas-control
            data-keybinding-capture
            className="w-[min(360px,calc(100vw-24px))]"
            align="start"
            side="top"
            collisionPadding={12}
          >
            <SavePreset
              initialOpen
              initialName={animation.preset.name}
              onSaved={() => setSave(null)}
              create={(name, id) =>
                captureMotionAnimationPreset(page, layerId, animation, name, id)
              }
            />
          </PopoverContent>
        </Popover>
      )}
      {error && <span role="alert">{t("applyFailed")}</span>}
    </>
  );
}
