import { createStart } from "@tanstack/react-start";

/** Public pages render on the server; the workspace explicitly opts into client-only rendering. */
export const startInstance = createStart(() => ({ defaultSsr: true }));
