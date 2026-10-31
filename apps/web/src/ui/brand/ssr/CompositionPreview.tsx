import { useEffect, useRef, useState } from "react";
import { readDataUrl } from "../../../services/assets/imports";
import { createBrandComposition, BRAND_ART_SOURCES, type BrandArtSources } from "./composition";
import { useTranslation } from "react-i18next";
import "./messages";

/** A single acknowledged native Three/TSL frame. No animation loop or CSS image treatments. */
export function CompositionPreview() {
  const host = useRef<HTMLDivElement>(null),
    { t } = useTranslation("brandSocial");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    let session: ReturnType<typeof import("@musart/render").createRenderSession> | undefined;
    let disposed = false;
    const work = (async () => {
      const sources = Object.fromEntries(
        await Promise.all(
          BRAND_ART_SOURCES.map(async ({ id, file }) => {
            const response = await fetch(`${import.meta.env.BASE_URL}branding/social/${file}`, {
              signal: abort.signal,
            });
            if (!response.ok) throw Error(`The brand artwork source ${id} could not be loaded.`);
            return [id, await readDataUrl(await response.blob())];
          }),
        ),
      ) as BrandArtSources;
      const project = createBrandComposition(sources);
      abort.signal.throwIfAborted();
      const { createRenderSession } = await import("@musart/render");
      abort.signal.throwIfAborted();
      session = createRenderSession({ maxBytes: 64 * 1024 * 1024 });
      await session.withCanvasFrame(
        project.pages[0]!,
        project.assets,
        (canvas) => {
          if (disposed || !host.current) return;
          host.current.replaceChildren(canvas);
          host.current.dataset.brandArtStatus = "ready";
        },
        { signal: abort.signal, canRender: () => !disposed },
      );
    })();
    void work
      .catch(async (error: unknown) => {
        if (!disposed) {
          setFailed(true);
          console.error(error);
        }
        await session?.dispose();
      })
      .catch((error: unknown) => console.error(error));
    return () => {
      disposed = true;
      abort.abort();
      void work
        .catch(() => undefined)
        .then(() => session?.dispose())
        .catch((error: unknown) => console.error(error));
    };
  }, []);
  return (
    <div
      className="brand-social-art"
      ref={host}
      data-brand-art-status={failed ? "failed" : "loading"}
      aria-label={t("artwork", { lng: "en" })}
    >
      {failed && <span role="alert">{t("failed", { lng: "en" })}</span>}
    </div>
  );
}
