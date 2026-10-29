import { expect, test } from "vitest";
import {
  errorDiagnostics,
  MAX_DIAGNOSTIC_BYTES,
} from "../../../src/components/notifications/diagnostics";
test("keeps actual error identity/code and cause without dumping requests or editor state", () => {
  const source = Object.assign(
    new Error("Frame failed", { cause: new Error("H264 packet corrupt") }),
    { name: "VideoSourceError", code: "decodeFailed", state: { password: "never-dump" } },
  );
  expect(errorDiagnostics(source)).toBe(
    "VideoSourceError [decodeFailed]: Frame failed\nCaused by:\nError: H264 packet corrupt",
  );
  expect(errorDiagnostics(source)).not.toContain("never-dump");
  expect(errorDiagnostics("native failure")).toBe("native failure");
  expect(errorDiagnostics(null)).toBe("null");
  const bad = Object.create(null, {
    message: {
      get() {
        throw Error("getter");
      },
    },
  });
  expect(errorDiagnostics(bad)).toBe("Error: No diagnostic message");
});
test("redacts credentials, bounds recursive/circular causes and caps UTF-8 output at 16KiB", () => {
  const message =
    "https://user:password@example.com/movie?access_token=hidden&safe=ok#api_key=bad Authorization: Bearer abc\nCookie: session=secret\npassword=123 api_key='456'";
  const text = errorDiagnostics(new Error(message));
  for (const secret of [
    "user:password",
    "hidden",
    "api_key=bad",
    "Bearer abc",
    "session=secret",
    "password=123",
    "'456'",
  ])
    expect(text).not.toContain(secret);
  expect(text).toContain("safe=ok");
  const circular = new Error("loop");
  circular.cause = circular;
  expect(errorDiagnostics(circular)).toContain("[circular cause]");
  let chain: Error = new Error("start");
  for (let index = 0; index < 10; index++) chain = new Error(`level${index}`, { cause: chain });
  expect(errorDiagnostics(chain)).toContain("[cause depth limit]");
  const long = errorDiagnostics(new Error("🌿".repeat(20000)));
  expect(new TextEncoder().encode(long).byteLength).toBeLessThanOrEqual(MAX_DIAGNOSTIC_BYTES);
  expect(long).toContain("[truncated]");
  expect(long).not.toContain("�");
});
