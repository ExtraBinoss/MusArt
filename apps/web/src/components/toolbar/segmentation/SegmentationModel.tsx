import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Check, Download, LoaderCircle, Trash2, X } from "lucide-react";
import { Progress } from "radix-ui";
import type { EditorServices } from "../../../state/contracts";
import type { LocalModelPort } from "../../../services/selection/model/contract";
import { MODEL_BYTES } from "../../../services/selection/model/manifest";
import type { TaskRunner } from "../../projects/ProjectDialog";
import { Button } from "../../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import "./messages";
import "./model.css";

export function SegmentationModel({
  services,
  onTask,
}: {
  services: EditorServices;
  onTask: TaskRunner;
}) {
  return services.segmentationModel ? (
    <ManagedModel model={services.segmentationModel} onTask={onTask} />
  ) : (
    <LegacyPreparation prepare={services.prepareSegmentation} onTask={onTask} />
  );
}
function ManagedModel({ model, onTask }: { model: LocalModelPort; onTask: TaskRunner }) {
  const { t, i18n } = useTranslation();
  const state = useSyncExternalStore(model.subscribe, model.read, model.read),
    [error, setError] = useState("");
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  const mb = (bytes: number) =>
    t("localModel:megabytes", { value: number.format(bytes / 1_000_000) });
  const busy = state.phase === "loading" || state.phase === "initializing",
    removing = state.phase === "removing";
  const percent = Math.min(100, (state.loaded / state.total) * 100);
  useEffect(() => {
    if (state.phase !== "idle" && state.phase !== "ready") return;
    let alive = true;
    void model.refresh().catch(() => {
      if (alive) setError(t("localModel:inspectError"));
    });
    return () => {
      alive = false;
    };
  }, [model, t, state.phase]);
  return (
    <div className="local-model" aria-live="polite">
      <div className="local-model-summary">
        <strong>SlimSAM</strong>
        <span>{mb(MODEL_BYTES)}</span>
      </div>
      {busy ? (
        <>
          <p>
            {t(
              state.phase === "initializing" ? "localModel:initializing" : "localModel:downloading",
            )}
          </p>
          <Progress.Root
            className="local-model-progress"
            value={percent}
            max={100}
            aria-label={t("localModel:downloadProgress")}
            aria-valuetext={t("localModel:progress", {
              loaded: mb(state.loaded),
              total: mb(state.total),
              percent: number.format(percent),
            })}
          >
            <Progress.Indicator style={{ transform: `translateX(-${100 - percent}%)` }} />
          </Progress.Root>
          <div className="local-model-progress-label">
            <span>
              {mb(state.loaded)} / {mb(state.total)}
            </span>
            <span>{number.format(percent)} %</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              model.cancel();
            }}
          >
            <X size={14} />
            {t("cancel")}
          </Button>
        </>
      ) : (
        <div className="local-model-actions">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={state.phase === "ready" || removing}
            onClick={() => {
              setError("");
              void onTask(async () => {
                try {
                  await model.prepare();
                } catch (error) {
                  if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
                }
              });
            }}
          >
            {state.phase === "ready" ? (
              <Check size={14} />
            ) : removing ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            {t(
              state.phase === "ready"
                ? "modelReady"
                : removing
                  ? "localModel:removing"
                  : state.available
                    ? "localModel:loadCached"
                    : "prepareModel",
            )}
          </Button>
          {state.files > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("localModel:remove")}
                  disabled={removing}
                  onClick={() => {
                    setError("");
                    void onTask(() => model.remove());
                  }}
                >
                  <Trash2 size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("localModel:remove")}</TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
      <small>
        {state.available
          ? t("localModel:cached", { size: mb(state.bytes) })
          : t("localModel:localHint")}
      </small>
      {(!state.supported || error || state.phase === "error") && (
        <p role="alert">
          {error ||
            (state.phase === "error" ? t("localModel:prepareError") : t("localModel:unavailable"))}
        </p>
      )}
    </div>
  );
}
/** Existing embedders can still prepare through the original service, without invented progress. */
function LegacyPreparation({
  prepare,
  onTask,
}: {
  prepare: () => Promise<void>;
  onTask: TaskRunner;
}) {
  const { t } = useTranslation(),
    alive = useRef(true);
  const [state, setState] = useState<"idle" | "loading" | "ready">("idle");
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return (
    <div className="local-model">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={state !== "idle"}
        onClick={() => {
          setState("loading");
          void onTask(prepare).then((ok) => {
            if (alive.current) setState(ok ? "ready" : "idle");
          });
        }}
      >
        {state === "loading" ? (
          <LoaderCircle size={14} className="animate-spin" />
        ) : state === "ready" ? (
          <Check size={14} />
        ) : (
          <Download size={14} />
        )}
        {t(state === "idle" ? "prepareModel" : state === "loading" ? "modelLoading" : "modelReady")}
      </Button>
      <small>{t("modelHint")}</small>
    </div>
  );
}
