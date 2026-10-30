import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { FontRenderState } from "../../../state/session/font-presentation";
import styles from "./FontPicker.module.css";
import "./messages";

export function FontRenderIndicator({ state }: { state?: FontRenderState & { label: string } }) {
  const { t } = useTranslation("fonts");
  if (!state || state.status === "idle" || state.status === "ready") return null;
  return state.status === "pending" ? (
    <LoaderCircle
      size={13}
      className="animate-spin"
      aria-label={t("rendering", { font: state.label })}
    />
  ) : (
    <CircleAlert
      size={13}
      className={styles.warning}
      aria-label={t("renderUnavailable", { font: state.label })}
    />
  );
}

/** Announce only the owned renderer ticket; sample decoding cannot acknowledge this status. */
export function FontRenderStatus({ state }: { state?: FontRenderState & { label: string } }) {
  const { t } = useTranslation("fonts");
  if (!state || state.status === "idle") return null;
  return (
    <p
      className={styles.status}
      role="status"
      data-font-render-status={state.status}
      data-font-render-family={state.ticket?.family}
      data-font-render-generation={state.ticket?.sequence}
      data-font-render-id={state.ticket?.fontId}
    >
      {state.status === "pending" ? (
        <LoaderCircle size={13} className="animate-spin" />
      ) : state.status === "ready" ? (
        <Check size={13} />
      ) : null}
      {t(
        state.status === "pending"
          ? "rendering"
          : state.status === "ready"
            ? "renderReady"
            : "renderUnavailable",
        { font: state.label },
      )}
    </p>
  );
}
