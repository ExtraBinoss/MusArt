# Brand SVG sources

This local catalog contains 57 brand marks. It is a documented exception to the application's Lucide-only control icon policy: these SVGs identify brands rather than application actions. Geometry comes from documented source collections and primary brand resources, not approximations.

- 50 marks (including LinkedIn): the `devicon` collection in [Iconify icon-sets, revision 69ca5094ddd4aad6d797e689bb13ee8b692ae232](https://github.com/iconify/icon-sets/blob/69ca5094ddd4aad6d797e689bb13ee8b692ae232/json/devicon.json), distributed under [Devicon's MIT license](https://github.com/devicons/devicon/blob/6a37858047b0e8d9c9c0e68f4a071fc410652e89/LICENSE).
- Microsoft: the four-color [SVG Logos mark, revision 4a5b550414be64d5c007574cd395d910d50e8950](https://github.com/gilbarbara/logos/blob/4a5b550414be64d5c007574cd395d910d50e8950/logos/microsoft-icon.svg), with the collection's [CC0 license](https://github.com/gilbarbara/logos/blob/4a5b550414be64d5c007574cd395d910d50e8950/LICENSE.txt).

License copies are retained in `licenses/`. Each entry retains its source URL and license. Adding a mark embeds the corresponding full credit and source in its validated document vector; standalone HTML preserves those credits in SVG metadata. These collection licenses concern the artwork distribution. Brand names and trademarks remain their owners' property; the catalog does not imply endorsement or grant trademark rights. See the source collections' own [Devicon notes](https://github.com/devicons/devicon#about-the-project) and [SVG Logos notes](https://github.com/gilbarbara/logos#readme).

Regenerate with `bun run icons:brands`. The script fetches pinned collection revisions, checks the reviewed local AI resource digests, and validates every vector through the engine schema. The browser loads only the local catalog on opening Brands. The landing page references small local SVG files, without importing the catalog. No logo CDN, external SVG references, executable markup or invented brand paths are used. Tests verify all entries, including LinkedIn, Figma's five colors and Microsoft's four colors.

## AI product marks

Six marks were retrieved from primary resources on 2026-10-17. [`agents/sources.json`](agents/sources.json) records each source URL, brand resource, archive member, original SHA-256, normalized SVG SHA-256, and any packaging conversion. Both reviewed source SVGs and normalized path-only SVGs are checked in. The regeneration script rejects changed digests; updating a mark requires reviewing the primary source again.

- **Claude:** Claude Spark — Clay from the [Anthropic press kit](https://anthropic.com/press-kit), linked by the [official newsroom](https://www.anthropic.com/news).
- **OpenAI:** black Blossom from the [official logo archive](https://cdn.openai.com/brand/openai-logos.zip), governed by [OpenAI's brand guidelines](https://openai.com/brand/). The landing label identifies Codex / ChatGPT with their parent brand, without inventing a distinct product logo.
- **Grok:** the two mark paths in the [official Grok header](https://grok.com). Grok Bot is an [official Grok product](https://x.ai/news/designing-grok-bot); the landing uses the shared Grok mark and does not invent a separate Bot logo.
- **Cursor:** 2D light cube from the archive linked by [Cursor brand guidelines](https://cursor.com/brand). The source stylesheet's fill is resolved inline.
- **OpenCode:** light mark from the archive linked by [OpenCode brand guidelines](https://opencode.ai/brand). Full-viewBox mask/clip wrappers have no visual effect and are removed from the catalog projection. The landing's dark variant comes from the same official archive.

- **Meta:** infinity symbol from the official `Meta_Company-Lockup.zip` archive linked by the [Meta brand resource center](https://www.meta.com/brand/resources/meta/company-brand/). The exact path in the SVG group `Symbol` is retained; the wordmark and non-rendering artboard outline are excluded. Official monochrome black and white variants are retained. The landing labels the product [Muse Code](https://dev.meta.ai/docs/muse-code) with its parent company’s symbol, exactly as the OpenAI symbol identifies Codex / ChatGPT. The shared catalog entry is **Meta** (`brand-meta`); no distinct Muse Code logo is asserted.

These primary resources do not assert an open redistribution license. Their `LicenseRef-…-Brand` credits preserve ownership, source, and applicable brand terms without inventing permission or treating collection licenses as a trademark grant. The marks identify products that can use the local ResumI CLI; they do not advertise native integrations, affiliation, partnership, or endorsement.

Imported SVGs use a separate bounded parser. It accepts paths and basic geometry, inherited solid paints and affine transforms. Scripts, external resources, filters, gradients, text and unsupported markup are rejected with a copyable error rather than silently omitted. The validated document stores paths and numeric properties, never raw SVG markup.
