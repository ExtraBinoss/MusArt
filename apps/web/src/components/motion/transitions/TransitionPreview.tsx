import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useReducedMotion } from "motion/react";
import type { EnginePort, TransitionStyle } from "@musart/core";
import type { TransitionOrigin } from "./authoring";
import { createTransitionPreviewSession } from "./preview-session";
import type { TransitionPreviewSource } from "./preview-source";

/** Pointer/focus events own animation; GPU acknowledgements never enter React state. */
export function TransitionPreview({
  engine,
  origin,
  style,
  placement,
  duration,
  optionActive,
  previewSource,
}: {
  engine: EnginePort;
  origin: TransitionOrigin;
  style: TransitionStyle;
  placement: "in" | "out";
  duration: number;
  optionActive: boolean;
  previewSource?: TransitionPreviewSource;
}) {
  const { t } = useTranslation("transitions");
  const reduced = !!useReducedMotion();
  const hovered = useSyncExternalStore(
    previewSource?.subscribe ?? noSubscription,
    previewSource?.read ?? noPreview,
    previewSource?.read ?? noPreview,
  );
  const shownStyle = hovered ?? style;
  const optionPreview = optionActive || hovered !== null;
  const host = useRef<HTMLDivElement>(null);
  const source = useRef<ReturnType<typeof createTransitionPreviewSession> | null>(null);
  const intent = useRef({ pointer: false, focus: false });
  const [failure, setFailure] = useState<{
    origin: TransitionOrigin;
    code: "changed" | "previewFailed";
  } | null>(null);
  useEffect(() => {
    let alive = true;
    const preview = createTransitionPreviewSession(engine, {
      onFrame(canvas) {
        if (alive && host.current && canvas.parentElement !== host.current)
          host.current.replaceChildren(canvas);
      },
      onError() {
        if (alive) setFailure({ origin, code: "previewFailed" });
      },
    });
    source.current = preview;
    const hidden = () => preview.visible(!document.hidden);
    const stop = engine.subscribe(() => {
      const current = engine.getSnapshot();
      if (
        current.project !== origin.project ||
        current.revision !== origin.revision ||
        current.pageId !== origin.compositionId
      ) {
        setFailure({ origin, code: "changed" });
        previewSource?.set(null);
        host.current?.replaceChildren();
        void preview.dispose().catch((error: unknown) => globalThis.reportError(error));
      }
    });
    document.addEventListener("visibilitychange", hidden);
    hidden();
    return () => {
      alive = false;
      source.current = null;
      previewSource?.set(null);
      stop();
      document.removeEventListener("visibilitychange", hidden);
      void preview.dispose().catch((error: unknown) => globalThis.reportError(error));
    };
  }, [engine, origin, previewSource]);
  useEffect(() => {
    if (!Number.isSafeInteger(duration) || duration < 1) {
      source.current?.play(false);
      return;
    }
    source.current?.update({ style: shownStyle, placement, duration });
    source.current?.play(
      !reduced && (optionPreview || intent.current.pointer || intent.current.focus),
    );
  }, [shownStyle, placement, duration, optionPreview, reduced, origin]);
  function play() {
    source.current?.play(
      !reduced && (optionPreview || intent.current.pointer || intent.current.focus),
    );
  }
  const error = failure?.origin === origin ? failure.code : null;
  return (
    <div
      className="motion-transition-preview"
      tabIndex={0}
      role="img"
      aria-label={t("preview", { name: t(`style.${shownStyle}`) })}
      onPointerEnter={() => {
        intent.current.pointer = true;
        play();
      }}
      onPointerLeave={() => {
        intent.current.pointer = false;
        play();
      }}
      onFocus={() => {
        intent.current.focus = true;
        play();
      }}
      onBlur={() => {
        intent.current.focus = false;
        play();
      }}
    >
      <div ref={host} className="motion-transition-preview-surface" />
      <span>{error ? t(error) : t("previewHint")}</span>
    </div>
  );
}

function noPreview(): null {
  return null;
}
function noSubscription() {
  return () => {};
}
