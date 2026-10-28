import { useTranslation } from "react-i18next";
import "./messages";
import "./loading.css";
import { useEffect, useState } from "react";
import { App } from "../App";
import { createRuntime, type EditorRuntime } from "../services/session/runtime";
import { attachAutomation } from "../services/automation/automation";
import { formatUiError } from "../state/i18n/errors/format";
export function Studio() {
  const { t } = useTranslation("startup");
  const [runtime, setRuntime] = useState<EditorRuntime | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    let current: EditorRuntime | undefined;
    let detach: (() => void) | undefined;
    const report = (error: unknown) => {
      if (!disposed) setError(formatUiError(error));
    };
    void createRuntime(report, { signal: controller.signal })
      .then((result) => {
        if (disposed) {
          void result.dispose().catch(report);
          return;
        }
        current = result;
        if (new URLSearchParams(location.search).get("automation") === "1")
          detach = attachAutomation(result.engine, result.services);
        setRuntime(result);
      })
      .catch(report);
    return () => {
      disposed = true;
      controller.abort();
      detach?.();
      void current?.dispose().catch(report);
    };
  }, []);
  return (
    <>
      {runtime ? (
        <App engine={runtime.engine} services={runtime.services} welcome={runtime.welcome} />
      ) : (
        <div className="studio-loading" role="status">
          <span className="studio-loading-skeleton" aria-hidden="true" />
          <span>{t("opening")}</span>
        </div>
      )}
      {error && (
        <div className="runtime-error" role="alert">
          <span>{error}</span>
          <button type="button" aria-label={t("dismiss")} onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
    </>
  );
}
