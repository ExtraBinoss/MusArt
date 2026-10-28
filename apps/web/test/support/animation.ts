import { deleteDB } from "idb";
import { openStudioDatabase } from "../../src/services/projects/database";
import { HistoryStore } from "../../src/services/history/store";
import { getAnimationSession } from "../../src/services/animation/session";
import { setup } from "./ui";
export async function animationSetup(edits = 2) {
  const d = setup();
  const name = `animation-ui-${crypto.randomUUID()}`;
  const connection = openStudioDatabase(name);
  const store = new HistoryStore(() => connection);
  const session = getAnimationSession(d.engine);
  const errors: unknown[] = [];
  session.attach(store, (error) => errors.push(error));
  await session.flush();
  for (let index = 0; index < edits; index++)
    d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { x: 40 + index } });
  await session.flush();
  return {
    ...d,
    session,
    store,
    errors,
    close: async () => {
      await session.dispose();
      (await connection).close();
      await deleteDB(name);
    },
  };
}
