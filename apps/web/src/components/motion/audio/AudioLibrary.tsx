import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Music2, Play, Plus, Upload, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EnginePort } from "@musart/core";
import { getMotionAudioSession } from "../../../services/motion/audio/session";
import { SFX_BANK, type SfxDefinition } from "../../../services/motion/audio/sfx";
import { bankShapes } from "../../../services/motion/audio/bank/geometry";
import shapesData from "../../../services/motion/audio/bank/shapes.json";
import type { BankOwner } from "../../../services/motion/audio/bank/model";
import { Popover, PopoverTrigger, PopoverContent } from "../../ui/popover";
import { ScrollShadow } from "../../shared/scroll/ScrollShadow";
import { useVirtualList } from "../../shared/scroll/use-virtual-list";
import { SelectField } from "../../shared/SelectField";
import { TimelineIconButton } from "../ControlButton";
import { createSfxPreview } from "./sfx-preview";
import { BankCanvasPainter } from "./bank/canvas";
import { SfxWaveform } from "./SfxWaveform";
import "./messages";
import "./audio.css";
const shapes = bankShapes(shapesData);
type Preview = ReturnType<typeof createSfxPreview>;
type Service = NonNullable<ReturnType<typeof getMotionAudioSession>>;

export function AudioLibrary({
  engine,
  disabled,
  onError,
}: {
  engine: EnginePort;
  disabled: boolean;
  onError: (error: unknown) => void;
}) {
  const { t } = useTranslation("motionAudio"),
    service = getMotionAudioSession(engine);
  const [category, setCategory] = useState("all"),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false),
    [owner, setOwner] = useState<BankOwner | null>(null);
  const activeOwner = useRef<BankOwner | null>(null);
  const preview = useMemo(
    () => (service ? createSfxPreview(service.bank, shapes) : null),
    [service],
  );
  const close = useCallback(() => {
    if (activeOwner.current !== owner) return;
    if (owner) preview?.close(owner);
    activeOwner.current = null;
    setOpen(false);
  }, [owner, preview]);
  useEffect(() => {
    if (!open || !owner || !preview) return;
    const origin = engine.getSnapshot();
    const stop = engine.subscribe(() => {
      const current = engine.getSnapshot();
      if (current.project !== origin.project || current.pageId !== origin.pageId) close();
    });
    const hidden = () => {
        if (document.hidden) preview.stop(owner);
      },
      pagehide = () => preview.stop(owner);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", pagehide);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", pagehide);
      preview.close(owner);
    };
  }, [engine, open, owner, preview, close]);
  useEffect(() => () => preview?.closeIntent(), [preview]);
  const intent = () => {
    if (!disabled && navigator.userActivation?.hasBeenActive) preview?.warm();
  };
  const run = useCallback(
    (job: () => Promise<void>) => {
      if (!service || busy) return;
      if (owner) preview?.stop(owner);
      setBusy(true);
      void job()
        .then(close, onError)
        .finally(() => setBusy(false));
    },
    [service, busy, owner, preview, close, onError],
  );
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          close();
          return;
        }
        if (!preview || !service) return;
        const held = preview.open();
        activeOwner.current = held;
        setOwner(held);
        setOpen(true);
        void service.enableSoundPreview().catch(() => {
          /* Explicit Play remains the permission retry. */
        });
      }}
    >
      <PopoverTrigger asChild>
        <TimelineIconButton
          className="motion-audio-add"
          label={t("add")}
          disabled={disabled || !service}
          onPointerEnter={intent}
          onFocus={intent}
          onPointerLeave={() => {
            if (!open) preview?.closeIntent();
          }}
          onBlur={() => {
            if (!open) preview?.closeIntent();
          }}
        >
          <Music2 size={13} />
        </TimelineIconButton>
      </PopoverTrigger>
      <PopoverContent className="motion-audio-library" side="top" align="end">
        {owner && preview && service && (
          <LibraryContent
            owner={owner}
            service={service}
            busy={busy}
            category={category}
            preview={preview}
            run={run}
            setCategory={setCategory}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Kept under Radix: no closed-bank row construction, and the exit animation keeps its canvases. */
function LibraryContent({
  owner,
  service,
  busy,
  category,
  preview,
  run,
  setCategory,
}: {
  owner: BankOwner;
  service: Service;
  busy: boolean;
  category: string;
  preview: Preview;
  run: (job: () => Promise<void>) => void;
  setCategory: (category: string) => void;
}) {
  const { t } = useTranslation("motionAudio"),
    input = useRef<HTMLInputElement>(null),
    root = useRef<HTMLDivElement>(null),
    status = useRef<HTMLOutputElement>(null);
  const painter = useMemo(
    () => new BankCanvasPainter(shapes, owner, service.bank),
    [owner, service],
  );
  useLayoutEffect(() => {
    if (!root.current) return;
    painter.mount(root.current);
    return () => painter.dispose();
  }, [painter]);
  useEffect(() => {
    const stop = preview.subscribe((state) => {
      if (state.owner !== owner) return;
      if (state.status === "ready" && state.id && state.playback)
        painter.start(state.id, state.playback);
      else painter.select(state.id, state.playback);
      if (status.current)
        status.current.textContent =
          state.status === "blocked"
            ? t("enableAudio")
            : state.status === "error"
              ? state.error || t("previewFailed")
              : "";
    });
    return () => {
      stop();
      preview.stop(owner);
    };
  }, [preview, owner, painter, t]);
  return (
    <div ref={root} className="motion-sfx-bank-body">
      <div className="motion-audio-library-header">
        <strong>{t("bank")}</strong>
        <span>
          <Popover>
            <PopoverTrigger asChild>
              <TimelineIconButton label={t("soundInfo")}>
                <Info size={13} />
              </TimelineIconButton>
            </PopoverTrigger>
            <PopoverContent side="top" className="motion-sfx-info">
              {t("originalLicense")}
            </PopoverContent>
          </Popover>
          <TimelineIconButton
            label={t("import")}
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <Upload size={13} />
          </TimelineIconButton>
        </span>
      </div>
      <input
        ref={input}
        hidden
        type="file"
        accept="audio/*"
        multiple
        onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = "";
          if (files.length) run(() => service.importFiles(files));
        }}
      />
      <SelectField
        label={t("bank")}
        value={category}
        onValueChange={(value) => {
          preview.stop(owner);
          setCategory(value);
        }}
        options={["all", "whoosh", "impact", "pop", "riser", "tone"].map((value) => ({
          value,
          label: t(value),
        }))}
      />
      <SoundList
        key={category}
        category={category}
        painter={painter}
        owner={owner}
        preview={preview}
        service={service}
        busy={busy}
        run={run}
      />
      <output ref={status} className="motion-sfx-status" role="status" aria-live="polite" />
    </div>
  );
}

const categories = ["whoosh", "impact", "pop", "riser", "tone"] as const;
const bankUnit = 19;

/** Two units per sound, one per header: shared fixed-row admission also covers compact groups. */
function SoundList({
  category,
  ...props
}: {
  category: string;
  painter: BankCanvasPainter;
  owner: BankOwner;
  preview: Preview;
  service: Service;
  busy: boolean;
  run: (job: () => Promise<void>) => void;
}) {
  const { t } = useTranslation("motionAudio"),
    viewport = useRef<HTMLDivElement>(null);
  const { entries, units } = useMemo(() => {
    const entries: { key: string; category: string; top: number; item: SfxDefinition | null }[] =
      [];
    let units = 0;
    for (const group of categories) {
      if (category !== "all" && category !== group) continue;
      if (category === "all")
        entries.push({ key: group, category: group, top: units++ * bankUnit, item: null });
      for (const item of SFX_BANK) {
        if (item.category !== group) continue;
        entries.push({ key: item.id, category: group, top: units * bankUnit, item });
        units += 2;
      }
    }
    return { entries, units };
  }, [category]);
  const { first, last, height, attachViewport } = useVirtualList(units, bankUnit, viewport, 2);
  return (
    <ScrollShadow className="motion-sfx-scroll">
      <div
        ref={attachViewport}
        className="motion-sfx-list"
        role="region"
        aria-label={t("bank")}
        tabIndex={0}
        onScroll={() => props.preview.scroll(props.owner)}
      >
        <div className="motion-sfx-virtual" style={{ height }}>
          {entries
            .filter(
              (entry) =>
                entry.top < last * bankUnit &&
                entry.top + (entry.item ? 38 : 19) > first * bankUnit,
            )
            .map((entry) => (
              <div
                key={entry.key}
                className={entry.item ? "motion-sfx-slot" : "motion-sfx-category"}
                data-sfx-category={entry.item ? undefined : entry.category}
                style={{ top: entry.top, height: entry.item ? 38 : 19 }}
                role={entry.item ? undefined : "heading"}
                aria-level={entry.item ? undefined : 3}
              >
                {entry.item ? <SoundItem item={entry.item} {...props} /> : t(entry.category)}
              </div>
            ))}
        </div>
      </div>
    </ScrollShadow>
  );
}

const SoundItem = memo(function SoundItem({
  item,
  painter,
  owner,
  preview,
  service,
  busy,
  run,
}: {
  item: SfxDefinition;
  painter: BankCanvasPainter;
  owner: BankOwner;
  preview: Preview;
  service: Service;
  busy: boolean;
  run: (job: () => Promise<void>) => void;
}) {
  const { t } = useTranslation("motionAudio");
  return (
    <div
      className="motion-sfx-item"
      data-preset-id={item.id}
      onPointerEnter={() => {
        if (!busy) preview.hover(owner, item.id);
      }}
      onPointerMove={(event) => {
        if (!busy && (event.movementX || event.movementY)) preview.hover(owner, item.id);
      }}
      onPointerLeave={() => preview.leave(owner, item.id)}
      onFocus={() => {
        if (!busy) preview.hover(owner, item.id, true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          preview.leave(owner, item.id);
      }}
    >
      <TimelineIconButton
        label={t("preview", { name: item.name })}
        disabled={busy}
        onClick={() => preview.play(owner, item.id)}
      >
        <Play size={12} />
      </TimelineIconButton>
      <span className="motion-sfx-name">
        {item.name}
        <small>{item.duration.toFixed(2)} s</small>
      </span>
      <SfxWaveform id={item.id} painter={painter} />
      <TimelineIconButton
        label={t("insert", { name: item.name })}
        disabled={busy}
        onClick={() => run(() => service.importPreset(item.id))}
      >
        <Plus size={13} />
      </TimelineIconButton>
    </div>
  );
});
