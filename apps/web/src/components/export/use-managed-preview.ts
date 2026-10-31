import { useEffect, useState } from "react";
import type { ManagedImageOptions } from "@musart/render";

export function useManagedPreview(
  source: { url: string | null; width: number; height: number; loading: boolean; failed: boolean },
  options: ManagedImageOptions,
) {
  const [result, setResult] = useState<{ key: string; url: string; failed: boolean } | null>(null);
  const key = JSON.stringify([source.url, options]);
  useEffect(() => {
    if (!source.url || options.colorMode !== "cmyk") return;
    const controller = new AbortController();
    let url: string | undefined;
    void (async () => {
      const [{ encodeManagedImage }, response] = await Promise.all([
        import("@musart/render"),
        fetch(source.url!, { signal: controller.signal }),
      ]);
      const blob = await encodeManagedImage(
        {
          blob: await response.blob(),
          options,
          width: source.width,
          height: source.height,
          name: "",
          proof: true,
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob);
      setResult({ key, url, failed: false });
    })().catch(() => {
      if (!controller.signal.aborted) setResult({ key, url: "", failed: true });
    });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
    // Only profile changes alter this native ICC proof; resolution and source live in the key.
  }, [key, source.url, source.width, source.height, options]);
  if (options.colorMode !== "cmyk") return source;
  return {
    ...source,
    url: result?.key === key ? result.url || null : null,
    loading: source.loading || (Boolean(source.url) && result?.key !== key),
    failed: source.failed || (result?.key === key && result.failed),
  };
}
