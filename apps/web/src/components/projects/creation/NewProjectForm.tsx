import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, Link, Unlink } from "lucide-react";
import type { NewProjectOptions } from "../../../state/contracts";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { FormatPresets } from "./FormatPresets";
import "./messages";
import "./creation.css";

export function NewProjectForm({
  onCreate,
  disabled = false,
}: {
  disabled?: boolean;
  onCreate(this: void, options: NewProjectOptions): void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [name, setName] = useState(t("untitled"));
  const [dimensions, setDimensions] = useState({ width: "1080", height: "1080" });
  const [preset, setPreset] = useState("custom");
  const [linked, setLinked] = useState(false);
  const ratio = useRef(1);
  const width = Number(dimensions.width),
    height = Number(dimensions.height);
  const valid =
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width >= 1 &&
    height >= 1 &&
    width <= 16384 &&
    height <= 16384;
  function change(axis: "width" | "height", value: string) {
    setPreset("custom");
    const next = Number(value);
    if (linked && next >= 1 && next <= 16384) {
      const opposite = Math.max(
        1,
        Math.round(axis === "width" ? next / ratio.current : next * ratio.current),
      );
      setDimensions(
        axis === "width"
          ? { width: value, height: String(opposite) }
          : { width: String(opposite), height: value },
      );
      return;
    }
    setDimensions((current) => ({ ...current, [axis]: value }));
  }
  return (
    <form
      className="new-project-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled || !valid || !name.trim()) return;
        onCreate({
          name: name.trim(),
          width,
          height,
          background: "#faf9f6",
          ...(preset !== "custom" ? { presetId: preset } : {}),
        });
      }}
    >
      <fieldset disabled={disabled} className="creation-fields">
        <div className="creation-preview" role="img" aria-label={t("creation:preview")}>
          <div
            className="creation-preview-board"
            style={{
              aspectRatio: `${valid ? width : 1080}/${valid ? height : 1080}`,
              width: `min(78%, calc(var(--creation-preview-height) * 0.76 * ${valid ? width / height : 1}))`,
            }}
          >
            <span>✳</span>
            <span>{t("creation:ready")}</span>
          </div>
          <span className="creation-preview-size">
            {t("creation:size", { width: valid ? width : "—", height: valid ? height : "—" })}
          </span>
        </div>
        <div className="creation-name">
          <Label htmlFor={`${id}-name`}>{t("name")}</Label>
          <Input
            id={`${id}-name`}
            autoFocus
            value={name}
            required
            maxLength={160}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <FormatPresets
          selected={preset}
          disabled={disabled}
          onChoose={(item) => {
            setPreset(item?.id ?? "custom");
            if (item) {
              setDimensions({ width: String(item.width), height: String(item.height) });
              ratio.current = item.width / item.height;
            }
          }}
        />
        <div className="creation-dimensions">
          {(["width", "height"] as const).map((axis, index) => (
            <div key={axis} className="creation-dimension">
              <Label htmlFor={`${id}-${axis}`}>{t(axis)}</Label>
              <div>
                <Input
                  id={`${id}-${axis}`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={16384}
                  step={1}
                  required
                  value={dimensions[axis]}
                  onChange={(event) => change(axis, event.target.value)}
                />
                <span aria-hidden>px</span>
              </div>
              {index === 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  className="creation-ratio"
                  aria-label={t(linked ? "creation:unlink" : "creation:link")}
                  aria-pressed={linked}
                  disabled={!valid}
                  onClick={() => {
                    ratio.current = width / height;
                    setLinked(!linked);
                  }}
                >
                  {linked ? <Link size={17} /> : <Unlink size={17} />}
                </Button>
              )}
            </div>
          ))}
        </div>
        <Button type="submit" className="creation-submit" disabled={!valid || !name.trim()}>
          {t("create")}
          <ArrowUpRight size={16} />
        </Button>
      </fieldset>
    </form>
  );
}
