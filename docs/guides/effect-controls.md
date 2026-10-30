# Effect controls and catalog

| Control                     | Behavior                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Add effect / Add adjustment | Keep the core catalog's existing effect/adjustment split. Both entry points use the same searchable catalog.                                     |
| Search                      | Match localized names, stable effect identifiers and translated family names. Search ignores case and accents; multiple words all have to match. |
| Category                    | Filter the current catalog to color, tone, texture, distortion, lighting, blur, retro or motion. Only families present in that catalog appear.   |
| Results                     | Show clear family headings and sort each family's translated names alphabetically. Empty results are explicit.                                   |
| Keyboard                    | Type in the search field without menu typeahead taking focus. Arrow Down enters the results; Escape dismisses the menu.                          |
| Scrolling                   | The results viewport remains bounded and uses the shared ScrollShadow. The category filter uses the shared Radix Select.                         |
| Selection                   | Add only the chosen registered effect through the existing command path. Browsing and filtering do not preview, edit or create undo entries.     |

Every effect parameter uses the same label, value and keyframe columns. Numeric fields retain their scrub/reset gestures, selects retain hover drafts, and color controls retain their cancel/commit lifecycle. The right-hand diamond column stays reserved when Static mode hides the buttons, so changing modes does not shift the values. Opacity, blending and alpha composition use the same row layout as the catalog-defined parameters.

Presentation families live in the web catalog and cover every registered effect through a typed mapping. They do not change portable documents or the core effect taxonomy. Controls still subscribe at their existing leaf/imperative boundaries; this layout adds no animation-frame subscriptions or App/Inspector updates.

Focused mirrors cover catalog membership, localized sorting/search, filtering, real Radix selection, stale action guards and parameter row structure. Native catalog checks verify real searching/selection. Native geometry checks verify the actual label/value/diamond columns; a DOM test alone does not prove pixel alignment.
