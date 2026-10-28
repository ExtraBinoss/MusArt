import { FlipHorizontal2, ScanLine, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Command, EnginePort, Layer } from "@musart/core";
import { IconButton } from "../shared/IconButton";
import { SelectField } from "../shared/SelectField";
import { Switch } from "../ui/switch";
export function MaskProperties({
  engine,
  layer,
  run,
  onCommand,
  disabled = false,
}: {
  engine: EnginePort;
  layer: Layer;
  run: (task: () => void) => void;
  onCommand?: (command: Command) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const mask = layer.mask;
  if (!mask) return null;
  function execute(command: Command) {
    if (disabled) return;
    if (onCommand) onCommand(command);
    else run(() => engine.execute(command));
  }
  return (
    <section className="inspector-section mask-properties">
      <div className="section-title">
        <h3>
          <ScanLine size={14} />
          {t("mask")}
        </h3>
        <div>
          <IconButton
            disabled={disabled}
            label={t("invertMask")}
            active={mask.inverted}
            onClick={() =>
              execute({
                type: "updateMask",
                targetId: layer.id,
                patch: { inverted: !mask.inverted },
              })
            }
          >
            <FlipHorizontal2 size={14} />
          </IconButton>
          <IconButton
            disabled={disabled}
            label={t("removeMask")}
            onClick={() => execute({ type: "removeLayerMask", targetId: layer.id })}
          >
            <Trash2 size={14} />
          </IconButton>
        </div>
      </div>
      <label className="switch-row">
        <span>{t("enableMask")}</span>
        <Switch
          disabled={disabled}
          aria-label={t("enableMask")}
          checked={mask.enabled}
          onCheckedChange={(enabled) =>
            execute({ type: "updateMask", targetId: layer.id, patch: { enabled } })
          }
        />
      </label>
      <SelectField
        disabled={disabled}
        label={t("maskMode")}
        value={mask.mode ?? "alpha"}
        options={[
          { value: "alpha", label: t("maskAlpha") },
          { value: "luminance", label: t("maskLuminance") },
        ]}
        onValueChange={(mode) =>
          execute({
            type: "updateMask",
            targetId: layer.id,
            patch: { mode: mode as "alpha" | "luminance" },
          })
        }
      />
      <p className="muted-description">{t(mask.layerId ? "linkedLayerMask" : "imageMask")}</p>
    </section>
  );
}
