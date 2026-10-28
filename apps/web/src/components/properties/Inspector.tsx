import { useRef, useState } from "react";
import { Palette, LockKeyhole, LockKeyholeOpen } from "lucide-react";
import { type Composition, type EnginePort, type Layer } from "@musart/core";
import { useTranslation } from "react-i18next";
import { useSetAtom } from "jotai";
import { useRenderMetrics } from "../../state/session/render-metrics";
import { previewAtom } from "../../state/session/editor";
import { ScrollShadow } from "../shared/scroll/ScrollShadow";
import { ColorControl } from "./ColorControl";
import { GradientControl } from "./gradient/GradientControl";
import { TextProperties } from "./TextProperties";
import { AlignmentPanel } from "./AlignmentPanel";
import { SpacingPanel } from "./SpacingPanel";
import { GuidesPanel } from "./GuidesPanel";
import { NumberInput } from "../shared/NumberInput";
import { SelectField } from "../shared/SelectField";
import { IconButton } from "../shared/IconButton";
import { Switch } from "../ui/switch";
import { Input } from "../ui/input";

interface Props {
  engine: EnginePort;
  page: Composition;
  selected: Layer[];
  run: (action: () => void) => void;
}
export function Inspector({ engine, page, selected, run }: Props) {
  const { t } = useTranslation();
  const element = useRef<HTMLElement>(null);
  useRenderMetrics(element);
  const setPreview = useSetAtom(previewAtom);
  const [aspectLocked, setAspectLocked] = useState(true);
  const layer = selected.length === 1 ? selected[0] : undefined;
  const useLayerColor = layer && ["rectangle", "ellipse", "text", "vector"].includes(layer.kind);
  function cancel() {
    setPreview(null);
  }
  function patch(patch: Partial<Layer>) {
    cancel();
    run(() =>
      engine.execute({ type: "updateLayers", ids: selected.map((item) => item.id), patch }),
    );
  }
  function preview(patch: Partial<Layer>) {
    if (layer) setPreview({ target: "layer", layerId: layer.id, patch });
  }
  function fillPatch(fill: string): Partial<Layer> {
    return layer?.kind === "vector" && layer.vector?.parts?.length
      ? { fill, vector: { ...layer.vector, preserveColors: false } }
      : { fill };
  }
  function pagePatch(patch: Partial<Composition>) {
    cancel();
    run(() => engine.execute({ type: "updatePage", patch }));
  }
  function pagePreview(patch: Partial<Composition>) {
    setPreview({ target: "page", patch });
  }
  function dimensionPatch(key: "width" | "height", value: number): Partial<Layer> {
    if (!layer || layer.kind !== "image" || !aspectLocked) return { [key]: value };
    return key === "width"
      ? { width: value, height: Math.max(1, (value * layer.height) / layer.width) }
      : { height: value, width: Math.max(1, (value * layer.width) / layer.height) };
  }
  function field(
    key: "x" | "y" | "width" | "height" | "rotation" | "radius" | "strokeWidth",
    label: string,
    min?: number,
    max?: number,
    unit = "px",
  ) {
    if (!layer) return null;
    const makePatch = (value: number) =>
      key === "width" || key === "height" ? dimensionPatch(key, value) : { [key]: value };
    return (
      <NumberInput
        key={key}
        identity={layer}
        label={label}
        value={layer[key]}
        min={min}
        max={max}
        unit={unit}
        disabled={layer.locked}
        onPreview={(value) => preview(makePatch(value))}
        onCommit={(value) => patch(makePatch(value))}
        onCancel={cancel}
      />
    );
  }
  const asset = layer?.assetId ? engine.getSnapshot().project.assets[layer.assetId] : undefined;
  return (
    <ScrollShadow className="inspector-scroll">
      <section
        className="inspector scrollable-panel"
        ref={element}
        data-selected-layer-id={layer?.id}
        aria-label={t("properties")}
      >
        <div className="inspector-title">
          <span className="inspector-selection">
            {selected.length > 1 ? t("multiSelection") : layer ? t(layer.kind) : t("composition")}
          </span>
        </div>
        {selected.length > 1 ? (
          <>
            <AlignmentPanel engine={engine} selected={selected} run={run} />
          </>
        ) : (
          <>
            <section className="inspector-section color-section">
              <div className="section-title">
                <h3>
                  <Palette size={13} />
                  {t(useLayerColor ? "fill" : "background")}
                </h3>
                <SelectField
                  label={t("colorMode")}
                  value={page.colorSpace ?? "srgb"}
                  className="color-mode-select"
                  options={[
                    { value: "srgb", label: "sRGB" },
                    { value: "display-p3", label: "Display P3" },
                    { value: "cmyk-proof", label: t("cmykProof") },
                  ]}
                  onValueChange={(colorSpace) =>
                    pagePatch({ colorSpace: colorSpace as NonNullable<Composition["colorSpace"]> })
                  }
                />
              </div>
              {page.colorSpace && page.colorSpace !== "srgb" && (
                <p className="muted-description color-mode-hint">
                  {t(page.colorSpace === "cmyk-proof" ? "cmykProofHint" : "displayP3Hint")}
                </p>
              )}
              {layer?.kind === "text" && (
                <GradientControl layer={layer} patch={patch} preview={preview} cancel={cancel} />
              )}
              {(layer?.kind !== "text" || !layer.fillGradient) && (
                <ColorControl
                  disabled={!!useLayerColor && layer.locked}
                  identity={useLayerColor ? layer.id : `page:${page.id}`}
                  value={useLayerColor ? layer.fill : page.background}
                  onPreview={(fill) => {
                    if (useLayerColor) preview(fillPatch(fill));
                    else pagePreview({ background: fill });
                  }}
                  onCommit={(fill) => {
                    if (useLayerColor) patch(fillPatch(fill));
                    else pagePatch({ background: fill });
                  }}
                  onCancel={cancel}
                />
              )}
              {layer?.kind === "vector" && !!layer.vector?.parts?.length && (
                <label
                  className="switch-row original-vector-colors"
                  title={t("originalColorsHint")}
                >
                  <span>{t("originalColors")}</span>
                  <Switch
                    aria-label={t("originalColors")}
                    checked={!!layer.vector.preserveColors}
                    onCheckedChange={(preserveColors) => {
                      if (layer.vector) patch({ vector: { ...layer.vector, preserveColors } });
                    }}
                  />
                </label>
              )}
            </section>
            {layer ? (
              <>
                <section className="inspector-section">
                  <div className="section-title">
                    <h3>{t("position")}</h3>
                    {layer.kind === "image" && (
                      <IconButton
                        label={t("lockAspect")}
                        active={aspectLocked}
                        onClick={() => setAspectLocked((value) => !value)}
                      >
                        {aspectLocked ? <LockKeyhole size={13} /> : <LockKeyholeOpen size={13} />}
                      </IconButton>
                    )}
                  </div>
                  <div className="fields-grid">
                    {field("x", "X")}
                    {field("y", "Y")}
                    {field("width", t("width"), 1, 32768)}
                    {field("height", t("height"), 1, 32768)}
                    {field("rotation", t("rotation"), -360, 360, "°")}
                    {layer.kind === "rectangle" && field("radius", t("cornerRadius"), 0, 4096)}
                  </div>
                  {asset && (
                    <div className="image-scale">
                      <NumberInput
                        identity={layer}
                        label={t("imageScale")}
                        value={(layer.width / asset.width) * 100}
                        min={0.1}
                        max={10000}
                        unit="%"
                        onPreview={(value) =>
                          preview(dimensionPatch("width", (asset.width * value) / 100))
                        }
                        onCommit={(value) =>
                          patch(dimensionPatch("width", (asset.width * value) / 100))
                        }
                        onCancel={cancel}
                      />
                      <span className="muted-description">
                        {t("originalDimensions", { width: asset.width, height: asset.height })}
                      </span>
                    </div>
                  )}
                </section>
                <AlignmentPanel engine={engine} selected={selected} run={run} />
                {layer.kind === "text" && (
                  <TextProperties layer={layer} patch={patch} preview={preview} cancel={cancel} />
                )}
                {["rectangle", "ellipse", "vector"].includes(layer.kind) && (
                  <section className="inspector-section">
                    <h3>{t("stroke")}</h3>
                    <div className="fields-grid">
                      {field("strokeWidth", t("stroke"), 0, 128)}
                      <Input
                        key={`${layer.id}:${layer.stroke}`}
                        aria-label={t("strokeHex")}
                        defaultValue={layer.stroke}
                        onChange={(event) => {
                          if (/^#(?:[\da-f]{6}|[\da-f]{8})$/i.test(event.currentTarget.value))
                            preview({ stroke: event.currentTarget.value });
                          else cancel();
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                          if (event.key === "Escape") {
                            event.preventDefault();
                            event.currentTarget.value = layer.stroke;
                            cancel();
                            event.currentTarget.blur();
                          }
                        }}
                        onBlur={(event) => {
                          if (
                            /^#(?:[\da-f]{6}|[\da-f]{8})$/i.test(event.currentTarget.value) &&
                            event.currentTarget.value !== layer.stroke
                          )
                            patch({ stroke: event.currentTarget.value });
                          else {
                            event.currentTarget.value = layer.stroke;
                            cancel();
                          }
                        }}
                      />
                    </div>
                  </section>
                )}
              </>
            ) : (
              <section className="inspector-section">
                <div className="section-title">
                  <h3>{t("composition")}</h3>
                </div>
                <Input
                  key={`${page.id}:${page.name}`}
                  aria-label={t("renamePage")}
                  defaultValue={page.name}
                  onBlur={(event) => {
                    const name = event.target.value.trim();
                    if (name && name !== page.name) pagePatch({ name });
                  }}
                />
                <div className="fields-grid">
                  {(["width", "height"] as const).map((key) => (
                    <NumberInput
                      key={key}
                      identity={page}
                      label={t(key)}
                      value={page[key]}
                      min={1}
                      max={16384}
                      unit="px"
                      onPreview={(value) => pagePreview({ [key]: value })}
                      onCommit={(value) => pagePatch({ [key]: value })}
                      onCancel={cancel}
                    />
                  ))}
                </div>
                <p className="muted-description">{t("selectLayer")}</p>
              </section>
            )}
            <SpacingPanel
              page={page}
              layer={layer}
              onLayerPatch={patch}
              onPagePatch={pagePatch}
              onLayerPreview={preview}
              onPagePreview={pagePreview}
              onCancel={cancel}
            />
          </>
        )}
        <GuidesPanel engine={engine} page={page} layer={layer} run={run} />
      </section>
    </ScrollShadow>
  );
}
