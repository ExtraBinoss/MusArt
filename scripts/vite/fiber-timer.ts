import type { Plugin } from "vite";

/** R3F 9.8.2 constructs Clock internally; its configure API offers no constructor injection. */
export function fiberTimerCompatibility(adapter: string): Plugin {
  return {
    name: "musart-fiber-timer-compatibility",
    enforce: "pre",
    resolveId(source, importer) {
      if (
        source !== "three" ||
        !importer?.replaceAll("\\", "/").includes("/node_modules/@react-three/fiber/")
      )
        return null;
      return adapter;
    },
  };
}
