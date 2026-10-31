import "../export/messages";
import { LayerAnimations } from "../motion/animations/LayerAnimations";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Palette,
  LockKeyhole,
  LockKeyholeOpen,
  MoveHorizontal,
  MoveVertical,
  ArrowLeftRight,
  ArrowUpDown,
  RotateCw,
  Radius,
  Pencil,
} from "lucide-react";
import {
  createLayerGeometryIndex,
  isAudioAsset,
  type Composition,
  type EnginePort,
  type Layer,
  type Project,
} from "@musart/core";
import { useTranslation } from "react-i18next";
import { useSetAtom } from "jotai";
import { useRenderMetrics } from "../../state/session/render-metrics";
import { previewAtom } from "../../state/session/editor";
import { ScrollShadow } from "../shared/scroll/ScrollShadow";
import { MotionColorControl } from "./motion/MotionColorControl";
import { GradientControl } from "./gradient/GradientControl";
import { TextProperties } from "./TextProperties";
import { AlignmentPanel } from "./AlignmentPanel";
import { SpacingPanel } from "./SpacingPanel";
import { GuidesPanel } from "./GuidesPanel";
import { MotionNumberInput as NumberInput } from "./motion/MotionNumberInput";
import { MotionFieldProvider } from "./motion/context";
import { useLayerPreview } from "../layers/controls/use-layer-preview";
import { createMotionTransport } from "../../services/motion/transport";
import { MotionField } from "./motion/MotionField";
import { MotionValueField } from "./motion/MotionValueField";
import { MotionStringInput } from "./motion/MotionStringInput";
import { SelectField } from "../shared/SelectField";
import { IconButton } from "../shared/IconButton";
import { Switch } from "../ui/switch";
import { Input } from "../ui/input";
import { LockedLayerNotice } from "./locked/LockedLayerNotice";

import { resolveInspectorPage, sameInspectorPage } from "./inspector-scope";

interface Props {
  engine: EnginePort;
  page: Composition;
  selected: readonly Layer[];
  run: (action: () => void) => void;
  assets?: Project["assets"];
}
export const Inspector = memo(
  function Inspector({ engine, page, selected, run, assets }: Props) {
    const { t } = useTranslation();
    const element = useRef<HTMLElement>(null);
    useRenderMetrics(element);
    const setPreview = useSetAtom(previewAtom);
    const [aspectLocked, setAspectLocked] = useState(true);
    const layer = selected.length === 1 ? selected[0] : undefined;
    const geometry = createLayerGeometryIndex(page);
    const locked = selected.some((item) => geometry.isLocked(item.id));
    const resolvePage = useCallback(() => resolveInspectorPage(engine, page), [engine, page]);
    const current = useCallback(() => {
      const snapshot = engine.getSnapshot();
      if (
        !resolveInspectorPage(engine, page) ||
        (assets && assets !== snapshot.project.assets) ||
        snapshot.selection.length !== selected.length
      )
        return false;
      const ids = new Set(snapshot.selection);
      return selected.every((item) => ids.has(item.id));
    }, [assets, engine, page, selected]);
    useEffect(() => {
      const changed = () => {
        if (!current()) setPreview(null);
      };
      changed();
      return engine.subscribe(changed);
    }, [engine, current, setPreview]);
    function runCurrent(action: () => void) {
      if (current())
        run(() => {
          if (current()) action();
        });
    }
    const edit = useLayerPreview(
      engine,
      page,
      selected.map((item) => item.id),
      runCurrent,
      true,
      resolvePage,
    );
    const displayLayer = layer && locked && !layer.locked ? { ...layer, locked: true } : layer;
    const useLayerColor = layer && ["rectangle", "ellipse", "text", "vector"].includes(layer.kind);
    function cancel() {
      edit.cancel();
    }
    function patch(patch: Partial<Layer>) {
      if (locked || !current()) return;
      edit.commit(patch);
    }
    function preview(patch: Partial<Layer>) {
      if (locked || !current()) return cancel();
      if (layer) edit.previewLayer(patch);
    }
    function fillPatch(fill: string): Partial<Layer> {
      return layer?.kind === "vector" && layer.vector?.parts?.length
        ? { fill, vector: { ...layer.vector, preserveColors: false } }
        : { fill };
    }
    function pagePatch(patch: Partial<Composition>) {
      cancel();
      runCurrent(() => engine.execute({ type: "updatePage", patch }));
    }
    function pagePreview(patch: Partial<Composition>) {
      if (current()) setPreview({ target: "page", patch });
      else cancel();
    }
    function dimensionPatch(key: "width" | "height", value: number): Partial<Layer> {
      if (!layer || layer.kind !== "image" || !aspectLocked) return { [key]: value };
      const pose =
        createMotionTransport(engine)
          .readFrame()
          ?.layers.find((item) => item.id === layer.id) ?? layer;
      return key === "width"
        ? { width: value, height: Math.max(1, (value * pose.height) / pose.width) }
        : { height: value, width: Math.max(1, (value * pose.width) / pose.height) };
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
      const Icon = {
        x: MoveHorizontal,
        y: MoveVertical,
        width: ArrowLeftRight,
        height: ArrowUpDown,
        rotation: RotateCw,
        radius: Radius,
        strokeWidth: Pencil,
      }[key];
      return (
        <NumberInput
          engine={engine}
          target={{ kind: "layer", layerId: layer.id, property: key }}
          keyframeTargets={
            layer.kind === "image" && aspectLocked && (key === "width" || key === "height")
              ? [
                  { kind: "layer", layerId: layer.id, property: "width" },
                  { kind: "layer", layerId: layer.id, property: "height" },
                ]
              : undefined
          }
          key={key}
          identity={layer}
          label={label}
          scrubLabel={
            <span className="position-field-label">
              <Icon size={13} aria-hidden />
              <span>{label}</span>
            </span>
          }
          value={layer[key]}
          resetValue={() =>
            key === "width" || key === "height"
              ? (asset?.[key] ??
                (layer.kind === "group"
                  ? layer[key]
                  : key === "width"
                    ? 280
                    : layer.kind === "text"
                      ? 100
                      : 220))
              : 0
          }
          min={min}
          max={max}
          unit={unit}
          disabled={locked}
          onPreview={(value) => preview(makePatch(value))}
          onCommit={(value) => patch(makePatch(value))}
          onCancel={cancel}
        />
      );
    }
    const original = layer?.assetId
      ? (assets ?? engine.getSnapshot().project.assets)[layer.assetId]
      : undefined;
    const asset = original && !isAudioAsset(original) ? original : undefined;
    return (
      <MotionFieldProvider editor={edit}>
        <ScrollShadow className="inspector-scroll">
          <section
            className="inspector scrollable-panel"
            ref={element}
            data-selected-layer-id={layer?.id}
            aria-label={t("properties")}
          >
            <div className="inspector-title">
              <span className="inspector-selection">
                {selected.length > 1
                  ? t("multiSelection")
                  : layer
                    ? t(layer.kind)
                    : t("composition")}
              </span>
            </div>
            <LockedLayerNotice engine={engine} page={page} layers={selected} run={runCurrent} />
            {selected.length > 1 ? (
              <>
                <fieldset className="locked-layer-controls" disabled={locked}>
                  <AlignmentPanel engine={engine} selected={selected} run={runCurrent} />
                </fieldset>
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
                        { value: "cmyk", label: t("exportPanel:cmyk") },
                        ...(page.colorSpace === "cmyk-proof"
                          ? [{ value: "cmyk-proof", label: t("cmykProof") }]
                          : []),
                      ]}
                      onValueChange={(colorSpace) =>
                        pagePatch({
                          colorSpace: colorSpace as NonNullable<Composition["colorSpace"]>,
                        })
                      }
                    />
                  </div>
                  {page.colorSpace && page.colorSpace !== "srgb" && (
                    <p className="muted-description color-mode-hint">
                      {t(
                        page.colorSpace === "cmyk"
                          ? "exportPanel:cmykCanvasHint"
                          : page.colorSpace === "cmyk-proof"
                            ? "cmykProofHint"
                            : "displayP3Hint",
                      )}
                    </p>
                  )}
                  {layer?.kind === "text" && (
                    <GradientControl
                      engine={engine}
                      layer={displayLayer!}
                      patch={patch}
                      preview={preview}
                      cancel={cancel}
                    />
                  )}
                  {(layer?.kind !== "text" || !layer.fillGradient) && (
                    <MotionColorControl
                      engine={useLayerColor ? engine : undefined}
                      target={
                        useLayerColor
                          ? { kind: "layer", layerId: layer.id, property: "fill" }
                          : undefined
                      }
                      label={t("fill")}
                      disabled={!!useLayerColor && locked}
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
                        disabled={locked}
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
                            disabled={locked}
                            onClick={() => setAspectLocked((value) => !value)}
                          >
                            {aspectLocked ? (
                              <LockKeyhole size={13} />
                            ) : (
                              <LockKeyholeOpen size={13} />
                            )}
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
                      <MotionField
                        engine={engine}
                        target={{ kind: "layer", layerId: layer.id, property: "visible" }}
                        label={t("motionProperties:visibility")}
                        disabled={locked}
                      >
                        <MotionValueField
                          engine={engine}
                          target={{ kind: "layer", layerId: layer.id, property: "visible" }}
                          fallback={layer.visible}
                        >
                          {(visible) => (
                            <label className="switch-row">
                              <span>{t("motionProperties:visibility")}</span>
                              <Switch
                                aria-label={t("motionProperties:visibility")}
                                disabled={locked}
                                checked={Boolean(visible)}
                                onCheckedChange={(visible) => patch({ visible })}
                              />
                            </label>
                          )}
                        </MotionValueField>
                      </MotionField>
                      {asset && (
                        <div className="image-scale">
                          <NumberInput
                            engine={engine}
                            target={{ kind: "layer", layerId: layer.id, property: "width" }}
                            displayScale={100 / asset.width}
                            keyframeTargets={
                              aspectLocked
                                ? [
                                    { kind: "layer", layerId: layer.id, property: "width" },
                                    { kind: "layer", layerId: layer.id, property: "height" },
                                  ]
                                : undefined
                            }
                            identity={layer}
                            label={t("imageScale")}
                            disabled={locked}
                            value={(layer.width / asset.width) * 100}
                            resetValue={100}
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
                    <fieldset className="locked-layer-controls" disabled={locked}>
                      <AlignmentPanel engine={engine} selected={selected} run={runCurrent} />
                    </fieldset>
                    {layer.kind === "text" && (
                      <TextProperties
                        engine={engine}
                        layer={displayLayer!}
                        patch={patch}
                        preview={preview}
                        cancel={cancel}
                      />
                    )}
                    {["rectangle", "ellipse", "vector"].includes(layer.kind) && (
                      <section className="inspector-section">
                        <h3>{t("stroke")}</h3>
                        <div className="fields-grid">
                          {field("strokeWidth", t("stroke"), 0, 128)}
                          <MotionField
                            engine={engine}
                            target={{ kind: "layer", layerId: layer.id, property: "stroke" }}
                            label={t("strokeHex")}
                            disabled={locked}
                          >
                            <MotionValueField
                              engine={engine}
                              target={{ kind: "layer", layerId: layer.id, property: "stroke" }}
                              fallback={layer.stroke}
                            >
                              {(stroke) => (
                                <MotionStringInput
                                  engine={engine}
                                  target={{ kind: "layer", layerId: layer.id, property: "stroke" }}
                                  validate={(stroke) =>
                                    /^#(?:[\da-f]{6}|[\da-f]{8})$/i.test(stroke)
                                  }
                                  value={String(stroke)}
                                  disabled={locked}
                                  label={t("strokeHex")}
                                  onPreview={(stroke) => preview({ stroke })}
                                  onCommit={(stroke) => patch({ stroke })}
                                  onCancel={cancel}
                                />
                              )}
                            </MotionValueField>
                          </MotionField>
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
                          resetValue={1080}
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
                {layer && <LayerAnimations engine={engine} layerId={layer.id} />}
                <SpacingPanel
                  page={page}
                  layer={displayLayer}
                  onLayerPatch={patch}
                  onPagePatch={pagePatch}
                  onLayerPreview={preview}
                  onPagePreview={pagePreview}
                  onCancel={cancel}
                />
              </>
            )}
            <GuidesPanel
              engine={engine}
              page={page}
              layer={layer}
              run={runCurrent}
              canEdit={current}
            />
          </section>
        </ScrollShadow>
      </MotionFieldProvider>
    );
  },
  (previous, next) =>
    previous.engine === next.engine &&
    previous.run === next.run &&
    previous.assets === next.assets &&
    (next.assets
      ? sameInspectorPage(previous.page, next.page)
      : previous.page === next.page && previous.selected === next.selected) &&
    previous.selected.length === next.selected.length &&
    previous.selected.every((layer, index) => layer === next.selected[index]),
);
