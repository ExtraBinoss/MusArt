import ts from "typescript";
import MagicString from "magic-string";
import type { Plugin } from "vite";

/** Measurement-build-only UserTiming boundaries, identical for both methods. */
export function textPreparationTiming(): Plugin {
  return {
    name: "musart-text-preparation-measurement-only",
    enforce: "pre",
    transform(code, id) {
      const clean = id.split("?")[0]!;
      const fonts = clean.endsWith("/surface/text/fonts.ts");
      const sources = clean.endsWith("/surface/text/source.ts");
      if (!fonts && !sources) return;
      const source = ts.createSourceFile(
        clean,
        code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      const edits: { at: number; text: string }[] = [];
      const seen: string[] = [];
      const visit = (node: ts.Node) => {
        if (
          ts.isMethodDeclaration(node) &&
          node.body &&
          ts.isClassDeclaration(node.parent) &&
          node.parent.name?.text === (fonts ? "FontRepository" : "TextSources")
        ) {
          const name = node.name.getText(source);
          const relevant = fonts
            ? name === "prepare"
            : name === "prepare" || name === "prepareLayer";
          if (relevant) {
            const start = node.body.getStart(source) + 1,
              end = node.body.end - 1;
            const body = code.slice(start, end);
            const metric = fonts
              ? "font-prepare"
              : name === "prepareLayer"
                ? "text-layer-prepare"
                : "text-prepare";
            const details = fonts
              ? "{key,family,weight}"
              : name === "prepareLayer"
                ? "{layerId:layer.id,family:layer.fontFamily,weight:layer.fontWeight}"
                : "{pageId:page.id}";
            if (sources && name === "prepareLayer") {
              const acquire =
                "const lease = await this.fonts.acquire(layer.fontFamily, layer.fontWeight);";
              if (body.split(acquire).length !== 2 || body.split("lease.release();").length !== 2)
                throw Error("Text source acquire/release measurement boundary changed.");
              edits.push({
                at: start + body.indexOf(acquire) + acquire.length,
                text: "\nconst __layoutStart = performance.now();",
              });
              edits.push({
                at: start + body.indexOf("lease.release();"),
                text: `performance.measure("musart:text-layout-curves",{start:__layoutStart,detail:${details}});\n`,
              });
            }
            edits.push({
              at: start,
              text: "\nconst __textStart=performance.now();let __textFailed=false;try{\n",
            });
            edits.push({
              at: end,
              text: `\n}catch(__textError){__textFailed=true;throw __textError;}finally{performance.measure("musart:${metric}",{start:__textStart,detail:{...${details},failed:__textFailed}});}\n`,
            });
            seen.push(name);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
      const expected = fonts ? ["prepare"] : ["prepare", "prepareLayer"];
      if (seen.join(",") !== expected.join(","))
        throw Error(`Unexpected timing targets in ${clean}: ${seen.join(",")}`);
      const output = new MagicString(code);
      for (const edit of edits.sort((a, b) => b.at - a.at)) output.appendLeft(edit.at, edit.text);
      return {
        code: output.toString(),
        map: output.generateMap({ hires: true, source: clean, includeContent: true }),
      };
    },
  };
}
