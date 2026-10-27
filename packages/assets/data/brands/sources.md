# Brand SVG sources

This catalog contains 57 brand marks copied from the owner-authorized ResumI checkout at revision `a2774b4930d47253e4ab2532f12f9c0abd9f08ca`. The path geometry and original part paints are preserved. Catalog data is split by category into files of fewer than 600 lines and loaded locally on demand.

- 50 marks (including LinkedIn): the `devicon` collection in [Iconify icon-sets, revision 69ca5094ddd4aad6d797e689bb13ee8b692ae232](https://github.com/iconify/icon-sets/blob/69ca5094ddd4aad6d797e689bb13ee8b692ae232/json/devicon.json), distributed under [Devicon's MIT license](https://github.com/devicons/devicon/blob/6a37858047b0e8d9c9c0e68f4a071fc410652e89/LICENSE).
- Microsoft: the four-color [SVG Logos mark, revision 4a5b550414be64d5c007574cd395d910d50e8950](https://github.com/gilbarbara/logos/blob/4a5b550414be64d5c007574cd395d910d50e8950/logos/microsoft-icon.svg), with the collection's [CC0 license](https://github.com/gilbarbara/logos/blob/4a5b550414be64d5c007574cd395d910d50e8950/LICENSE.txt).

License copies are retained in `licenses/`. Each entry retains its source URL and license. Adding a mark embeds the corresponding full credit and source in its validated document vector; standalone HTML preserves those credits in SVG metadata. These collection licenses concern the artwork distribution. Brand names and trademarks remain their owners' property; the catalog does not imply endorsement or grant trademark rights. See the source collections' own [Devicon notes](https://github.com/devicons/devicon#about-the-project) and [SVG Logos notes](https://github.com/gilbarbara/logos#readme).

The browser loads the local brand catalog when its picker opens. Each entry retains its source, license and attribution. Inserting artwork stores those credits alongside portable vector paths; the standalone SVG exporter preserves metadata.

## AI product marks

Six marks were retrieved from primary resources on 2026-10-17. [`upstream-sources.json`](upstream-sources.json) records each source URL, brand resource, archive member, original SHA-256, normalized SVG SHA-256, and any packaging conversion. This upstream ledger describes the reviewed source artwork; MusArt includes its projected path catalog rather than the upstream landing-page assets or regeneration tooling.

- **Claude:** Claude Spark — Clay from the [Anthropic press kit](https://anthropic.com/press-kit), linked by the [official newsroom](https://www.anthropic.com/news).
- **OpenAI:** black Blossom from the [official logo archive](https://cdn.openai.com/brand/openai-logos.zip), governed by [OpenAI's brand guidelines](https://openai.com/brand/).
- **Grok:** the two mark paths in the [official Grok header](https://grok.com). Grok Bot is an [official Grok product](https://x.ai/news/designing-grok-bot); the catalog uses the shared Grok mark.
- **Cursor:** 2D light cube from the archive linked by [Cursor brand guidelines](https://cursor.com/brand). The source stylesheet's fill is resolved inline.
- **OpenCode:** light mark from the archive linked by [OpenCode brand guidelines](https://opencode.ai/brand). Full-viewBox mask/clip wrappers have no visual effect and are removed from the catalog projection.

- **Meta:** infinity symbol from the official `Meta_Company-Lockup.zip` archive linked by the [Meta brand resource center](https://www.meta.com/brand/resources/meta/company-brand/). The exact path in the SVG group `Symbol` is retained; the wordmark and non-rendering artboard outline are excluded. Official monochrome black and white variants are retained. The shared catalog entry is **Meta** (`brand-meta`).

These primary resources do not assert an open redistribution license. Their `LicenseRef-…-Brand` credits preserve ownership, source, and applicable brand terms without inventing permission or treating collection licenses as a trademark grant. The marks identify brands in user-authored compositions. Their presence does not imply an integration, affiliation, partnership or endorsement.

Imported SVGs use a separate bounded parser. It accepts paths and basic geometry, inherited solid paints and affine transforms. Scripts, external resources, filters, gradients, text and unsupported markup are rejected with a copyable error rather than silently omitted. The validated document stores paths and numeric properties, never raw SVG markup.
