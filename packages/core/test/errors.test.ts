import { expect, it } from "vitest";
import { EngineError, ensure } from "../src/errors";
it("reports stable machine-readable errors and preserves valid conditions", () => {
  expect(() => ensure(true, "LOCKED", "locked")).not.toThrow();
  try {
    ensure(false, "LOCKED", "Locked ancestor");
  } catch (error) {
    expect(error).toBeInstanceOf(EngineError);
    expect(error).toMatchObject({
      name: "EngineError",
      code: "LOCKED",
      message: "Locked ancestor",
    });
  }
});
