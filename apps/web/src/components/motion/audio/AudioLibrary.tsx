import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Music2, Play, Plus, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EnginePort } from "@musart/core";
import { getMotionAudioSession } from "../../../services/motion/audio/session";
import { SFX_BANK } from "../../../services/motion/audio/sfx";
import { Popover, PopoverTrigger, PopoverContent } from "../../ui/popover";
import { Button } from "../../ui/button";
import { ScrollShadow } from "../../shared/scroll/ScrollShadow";
import { SelectField } from "../../shared/SelectField";
import { TimelineIconButton } from "../ControlButton";
import { createSfxPreview, type SfxPreviewState } from "./sfx-preview";
import { SfxWaveform } from "./SfxWaveform";
import "./messages";
import "./audio.css";

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
  const input = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState("all"),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<SfxPreviewState>({ id: null, status: "idle" });
  const audition = useMemo(
    () => (service ? createSfxPreview(service, setPreview) : null),
    [service],
  );
  useEffect(() => {
    if (!open || !audition) return;
    const origin = engine.getSnapshot();
    const stop = engine.subscribe(() => {
      const current = engine.getSnapshot();
      if (current.project !== origin.project || current.pageId !== origin.pageId) {
        audition.stop();
        setOpen(false);
      }
    });
    const hidden = () => {
      if (document.hidden) audition.stop();
    };
    document.addEventListener("visibilitychange", hidden);
    const pagehide = () => audition.stop();
    window.addEventListener("pagehide", pagehide);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", pagehide);
      audition.stop(false);
    };
  }, [engine, open, audition]);
  const run = (job: () => Promise<void>) => {
    if (!service || busy) return;
    audition?.stop();
    setBusy(true);
    void job()
      .then(() => {
        service.stopPreview();
        setOpen(false);
      }, onError)
      .finally(() => setBusy(false));
  };
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) audition?.stop();
        else
          void service?.enableSoundPreview().catch(() => {
            /* The explicit Play button can retry browser permission. */
          });
      }}
    >
      <PopoverTrigger asChild>
        <TimelineIconButton
          className="motion-audio-add"
          label={t("add")}
          disabled={disabled || !service}
        >
          <Music2 size={13} />
        </TimelineIconButton>
      </PopoverTrigger>
      <PopoverContent className="motion-audio-library" side="top" align="end">
        <LibraryContent
          input={input}
          service={service}
          busy={busy}
          category={category}
          preview={preview}
          audition={audition}
          run={run}
          setCategory={setCategory}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Construct bank controls only while Radix actually mounts its content, including exit animation. */
function LibraryContent({
  input,
  service,
  busy,
  category,
  preview,
  audition,
  run,
  setCategory,
}: {
  input: RefObject<HTMLInputElement | null>;
  service: ReturnType<typeof getMotionAudioSession>;
  busy: boolean;
  category: string;
  preview: SfxPreviewState;
  audition: ReturnType<typeof createSfxPreview> | null;
  run: (job: () => Promise<void>) => void;
  setCategory: (category: string) => void;
}) {
  const { t } = useTranslation("motionAudio");
  return (
    <>
      <div className="motion-audio-library-header">
        <strong>{t("bank")}</strong>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          <Upload size={13} />
          {t("import")}
        </Button>
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
          if (files.length) run(() => service!.importFiles(files));
        }}
      />
      <SelectField
        label={t("bank")}
        value={category}
        onValueChange={(value) => {
          audition?.stop();
          setCategory(value);
        }}
        options={["all", "whoosh", "impact", "pop", "riser", "tone"].map((value) => ({
          value,
          label: t(value),
        }))}
      />
      <ScrollShadow className="motion-sfx-scroll">
        <div className="motion-sfx-list">
          {SFX_BANK.filter((item) => category === "all" || item.category === category).map(
            (item) => (
              <div
                key={item.id}
                className="motion-sfx-item"
                data-preview-active={preview.id === item.id || undefined}
                onPointerEnter={() => {
                  if (!busy) audition?.hover(item.id);
                }}
                onPointerLeave={() => audition?.leave(item.id)}
                onFocus={() => {
                  if (!busy) audition?.hover(item.id);
                }}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                    audition?.leave(item.id);
                }}
              >
                <TimelineIconButton
                  label={t("preview", { name: item.name })}
                  disabled={busy}
                  onClick={() => audition?.play(item.id)}
                >
                  <Play size={12} />
                </TimelineIconButton>
                <span>
                  {item.name}
                  <small>{item.duration.toFixed(2)} s</small>
                </span>
                <TimelineIconButton
                  label={t("insert", { name: item.name })}
                  disabled={busy}
                  onClick={() => run(() => service!.importPreset(item.id))}
                >
                  <Plus size={13} />
                </TimelineIconButton>
              </div>
            ),
          )}
        </div>
      </ScrollShadow>
      <div className="motion-sfx-preview" aria-live="polite">
        <SfxWaveform peaks={preview.peaks} />
        <span>
          {preview.id ? SFX_BANK.find((item) => item.id === preview.id)?.name : t("hoverPreview")}
        </span>
        <small>
          {t(
            preview.status === "blocked"
              ? "enableAudio"
              : preview.status === "error"
                ? "previewFailed"
                : preview.status === "preparing"
                  ? "preparing"
                  : "browserSound",
          )}
        </small>
        {preview.status === "error" && preview.error && <small role="alert">{preview.error}</small>}
      </div>
      <p className="motion-audio-library-note" role={busy ? "status" : undefined}>
        {t(busy ? "preparing" : "original")}
      </p>
    </>
  );
}
