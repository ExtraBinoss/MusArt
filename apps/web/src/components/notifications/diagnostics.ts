export const MAX_DIAGNOSTIC_BYTES = 16 * 1024;
const MAX_CAUSE_DEPTH = 4;

function field(value: object, key: string): unknown {
  try {
    return (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}
function redact(value: string): string {
  return value
    .replace(/https?:\/\/[^\s)]+/gi, (raw) => {
      try {
        const url = new URL(raw);
        if (url.username) url.username = "redacted";
        if (url.password) url.password = "redacted";
        for (const key of url.searchParams.keys())
          if (/token|key|secret|pass|credential|auth/i.test(key))
            url.searchParams.set(key, "redacted");
        if (/token|secret|password|api[-_]?key|authorization/i.test(url.hash))
          url.hash = "redacted";
        return url.href;
      } catch {
        return "[unavailable URL]";
      }
    })
    .replace(/\b(authorization["']?\s*[:=]\s*["']?)(?:bearer\s+)?[^"'\s,;]+/gi, "$1[redacted]")
    .replace(/\b(cookie["']?\s*[:=]\s*)[^\r\n]+/gi, "$1[redacted]")
    .replace(
      /\b((?:api[-_]?key|access[-_]?token|refresh[-_]?token|token|password|secret|client[-_]?secret)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&]+)/gi,
      "$1[redacted]",
    );
}

/** Select only failure identity/message/cause; never serialize request objects, state or credentials. */
export function errorDiagnostics(error: unknown): string {
  const seen = new Set<object>(),
    parts: string[] = [];
  let value = error;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth++) {
    if (typeof value !== "object" || value === null) {
      parts.push(String(value).slice(0, MAX_DIAGNOSTIC_BYTES * 2));
      break;
    }
    if (seen.has(value)) {
      parts.push("[circular cause]");
      break;
    }
    seen.add(value);
    const name = field(value, "name"),
      message = field(value, "message"),
      code = field(value, "code");
    parts.push(
      `${typeof name === "string" ? name.slice(0, 128) : "Error"}${typeof code === "string" ? ` [${code.slice(0, 256)}]` : ""}: ${typeof message === "string" ? message.slice(0, MAX_DIAGNOSTIC_BYTES) : "No diagnostic message"}`,
    );
    const cause = field(value, "cause");
    if (cause === undefined) break;
    if (depth === MAX_CAUSE_DEPTH) {
      parts.push("[cause depth limit]");
      break;
    }
    parts.push("Caused by:");
    value = cause;
  }
  const text = redact(parts.join("\n")),
    bytes = new TextEncoder().encode(text);
  if (bytes.byteLength <= MAX_DIAGNOSTIC_BYTES) return text;
  const suffix = "\n[truncated]";
  return (
    new TextDecoder().decode(bytes.subarray(0, MAX_DIAGNOSTIC_BYTES - suffix.length), {
      stream: true,
    }) + suffix
  );
}
