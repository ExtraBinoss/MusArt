import { useEffect, useId, useMemo, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import {
  createMotionEasingPreset,
  isMotionEasing,
  MOTION_EASING_PRESETS,
  type EnginePort,
  type MotionEasing,
  type MotionEasingPreset,
  type MotionKeyframe,
  type MotionPropertyTrack,
} from "@musart/core";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { SelectField } from "../../shared/SelectField";
import { CurveGraph } from "./CurveGraph";
import {
  captureEasingOrigin,
  commitEasing,
  easingGraph,
  identifyEasing,
  type EasingOrigin,
} from "./model";
import "./messages";
import "./easing.css";

function curveFields(easing: MotionEasing): Record<string, string> {
  if (easing.type === "cubicBezier")
    return {
      x1: String(easing.x1),
      y1: String(easing.y1),
      x2: String(easing.x2),
      y2: String(easing.y2),
    };
  if (easing.type === "spring")
    return { bounce: String(easing.bounce), response: String(easing.response ?? 12) };
  return {};
}
function candidateCurve(base: MotionEasing, fields: Record<string, string>): MotionEasing | null {
  if (Object.values(fields).some((text) => !text.trim())) return null;
  const value =
    base.type === "cubicBezier"
      ? {
          type: "cubicBezier",
          x1: Number(fields.x1),
          y1: Number(fields.y1),
          x2: Number(fields.x2),
          y2: Number(fields.y2),
        }
      : base.type === "spring"
        ? { type: "spring", bounce: Number(fields.bounce), response: Number(fields.response) }
        : base;
  return isMotionEasing(value) ? value : null;
}

function presetCurve(value: string): MotionEasing {
  return value === "customBezier"
    ? { type: "cubicBezier", x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 }
    : value === "customSpring"
      ? { type: "spring", bounce: 0.5, response: 12 }
      : createMotionEasingPreset(value as MotionEasingPreset);
}

function PresetLabel({
  value,
  label,
  easing,
}: {
  value: string;
  label: string;
  easing?: MotionEasing;
}) {
  const graph = easingGraph(easing ?? presetCurve(value), 24);
  return (
    <span className="motion-easing-preset-label">
      <svg className="motion-easing-preset-curve size-auto" viewBox="10 0 224 140" aria-hidden>
        <path
          d={graph.path}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.3}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span>{label}</span>
    </span>
  );
}

/** All changes are local drafts until Apply; dismissal never manufactures undo entries. */
export function EasingPopover({
  engine,
  compositionId,
  property,
  destination,
  children,
}: {
  engine: EnginePort;
  compositionId: string;
  property: MotionPropertyTrack;
  destination: MotionKeyframe;
  children: ReactElement;
}) {
  const { t } = useTranslation("motionEasing");
  const id = useId();
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState<EasingOrigin | null>(null);
  const [draft, setDraft] = useState<MotionEasing>(destination.easing ?? { type: "linear" });
  const [fields, setFields] = useState<Record<string, string>>(() => curveFields(draft));
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<MotionEasing | null>(null);
  const presets = useMemo(
    () =>
      open
        ? [...MOTION_EASING_PRESETS, "customBezier", "customSpring"].map((value) => ({
            value,
            label: <PresetLabel value={value} label={t(value)} />,
          }))
        : [],
    [open, t],
  );
  const candidate = candidateCurve(draft, fields);
  const selectedPreset = open ? identifyEasing(draft) : "linear";
  useEffect(() => {
    if (!open || !origin) return;
    return engine.subscribe(() => {
      const next = engine.getSnapshot();
      if (
        next.project.id !== origin.projectId ||
        next.pageId !== origin.pageId ||
        next.revision !== origin.revision
      ) {
        setStale(true);
        setError("changed");
        setPreview(null);
      }
    });
  }, [engine, open, origin]);
  function setCurve(value: MotionEasing) {
    if (stale || !isMotionEasing(value)) return;
    setDraft(value);
    setFields(curveFields(value));
    setPreview(null);
    setError("");
  }
  function changeOpen(next: boolean) {
    setPreview(null);
    if (next) {
      try {
        const value = captureEasingOrigin(engine, compositionId, property.id, destination.id);
        const initial = value.key.easing ?? { type: "linear" as const };
        setOrigin(value);
        setDraft(initial);
        setFields(curveFields(initial));
        setStale(false);
        setError("");
      } catch {
        setOrigin(null);
        setStale(true);
        setError("changed");
      }
    }
    setOpen(next);
  }
  function apply() {
    if (!origin || !candidate || stale) return;
    try {
      commitEasing(engine, origin, candidate);
      setOpen(false);
    } catch {
      setError(engine.getSnapshot().revision !== origin.revision ? "changed" : "failed");
    }
  }
  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      {open && (
        <PopoverContent
          className="motion-easing-popover"
          side="top"
          align="center"
          aria-label={t("title")}
          data-canvas-control
          data-keybinding-capture
        >
          <header>
            <strong>{t("title")}</strong>
            <p>{t("incoming")}</p>
          </header>
          <SelectField
            label={t("preset")}
            value={selectedPreset}
            disabled={stale}
            side="right"
            options={presets}
            selectedLabel={
              <PresetLabel value={selectedPreset} label={t(selectedPreset)} easing={draft} />
            }
            onPreview={(value) => setPreview(presetCurve(value))}
            onPreviewCancel={() => setPreview(null)}
            onValueChange={(value) => setCurve(presetCurve(value))}
          />
          <CurveGraph
            easing={preview ?? draft}
            onChange={setCurve}
            disabled={stale || preview !== null}
          />
          {draft.type === "hold" && <p className="motion-easing-hint">{t("holdHint")}</p>}
          {(draft.type === "cubicBezier" || draft.type === "spring") && (
            <div className={`motion-easing-fields ${draft.type === "spring" ? "is-spring" : ""}`}>
              {(draft.type === "cubicBezier"
                ? ["x1", "y1", "x2", "y2"]
                : ["bounce", "response"]
              ).map((key) => (
                <div key={key}>
                  <Label htmlFor={`${id}-${key}`}>
                    {key === "bounce" || key === "response" ? t(key) : key.toUpperCase()}
                  </Label>
                  <Input
                    id={`${id}-${key}`}
                    type="number"
                    step={key === "response" ? 1 : 0.01}
                    disabled={stale}
                    value={fields[key] ?? ""}
                    min={
                      key.startsWith("x") || key === "bounce"
                        ? 0
                        : key === "response"
                          ? 1
                          : undefined
                    }
                    max={
                      key.startsWith("x") || key === "bounce"
                        ? 1
                        : key === "response"
                          ? 40
                          : undefined
                    }
                    aria-invalid={candidate === null}
                    onChange={(event) => {
                      const next = { ...fields, [key]: event.target.value };
                      setFields(next);
                      const value = candidateCurve(draft, next);
                      if (value) setDraft(value);
                    }}
                  />
                </div>
              ))}
            </div>
          )}
          {!candidate && (
            <p className="motion-easing-error" role="alert">
              {t("invalid")}
            </p>
          )}
          {error && (
            <p className="motion-easing-error" role="alert">
              {t(error)}
            </p>
          )}
          <footer>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button size="sm" onClick={apply} disabled={!candidate || stale || !origin}>
              {t("apply")}
            </Button>
          </footer>
        </PopoverContent>
      )}
    </Popover>
  );
}
