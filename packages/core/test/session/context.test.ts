import { it, expectTypeOf } from "vitest";
import type { CommandContext, CommandHandler, CommandResult } from "../../src/session/context";
it("correlates each registry handler with its command payload", () => {
  expectTypeOf<Parameters<CommandHandler<"renameProject">>[1]>().toEqualTypeOf<{
    type: "renameProject";
    name: string;
  }>();
  expectTypeOf<CommandContext>().toHaveProperty("pageId").toBeString();
  expectTypeOf<CommandResult>().toHaveProperty("selection").toEqualTypeOf<string[] | undefined>();
});
