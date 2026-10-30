import { useRef, useState, type ComponentProps } from "react";
import { Copy, Ellipsis, RotateCcw, Save, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  addMotionTime,
  captureMotionAnimationPreset,
  type Composition,
  type EnginePort,
  type MotionAnimation,
} from "@musart/core";
import { Button } from "../../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import { SavePreset } from "./SavePreset";

function Action({ label, children, ...props }: ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
export function AnimationActions({
  engine,
  page,
  layerId,
  trackId,
  animation,
  run,
  disabled,
}: {
  engine: EnginePort;
  page: Composition;
  layerId: string;
  trackId: string;
  animation: MotionAnimation;
  run: (action: () => void) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation("animations");
  const [saving, setSaving] = useState(false),
    [saved, setSaved] = useState(false);
  const saveRequested = useRef(false);
  return (
    <>
      <div className="animation-instance-actions">
        <Action
          label={t("duplicate")}
          disabled={disabled}
          onClick={() =>
            run(() =>
              engine.execute({
                type: "addMotionAnimation",
                trackId,
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
        </Action>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon-xs" aria-label={t("moreActions")}>
                  <Ellipsis size={14} />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>{t("moreActions")}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent
            align="end"
            className="animation-action-menu"
            data-canvas-control
            data-keybinding-capture
            onCloseAutoFocus={(event) => {
              if (saveRequested.current) {
                saveRequested.current = false;
                event.preventDefault();
                setSaving(true);
                setSaved(false);
              }
            }}
          >
            <DropdownMenuItem
              disabled={disabled}
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
              <span>
                {t("reverse")}
                <small>{t("reverseHint")}</small>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                saveRequested.current = true;
              }}
            >
              <Save size={14} />
              {t("save")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Action
          label={t("remove")}
          className="animation-delete-action"
          disabled={disabled}
          onClick={() =>
            run(() => engine.execute({ type: "deleteMotionAnimation", animationId: animation.id }))
          }
        >
          <Trash2 size={12} />
        </Action>
      </div>
      {saving && (
        <div className="animation-save-editor">
          <SavePreset
            initialOpen
            initialName={animation.preset.name}
            onCancel={() => setSaving(false)}
            onSaved={() => {
              setSaving(false);
              setSaved(true);
            }}
            create={(name, id) => captureMotionAnimationPreset(page, layerId, animation, name, id)}
          />
        </div>
      )}
      {saved && (
        <span role="status" className="animation-save-feedback">
          {t("saved")}
        </span>
      )}
    </>
  );
}
