# Contrats de construction

- `packages/core`: modèle sérialisable, validation, moteur immutable, historique et géométrie. Aucun DOM/React/GPU.
- `packages/render`: composition GPU de textures/RenderTargets, effets TSL confinés par calque/groupe; sources image directement uploadées et sources texte préparées au besoin. Zéro readback GPU vers JavaScript; export via canvas GPU et encodeur navigateur. Le même graphe alimente R3F et l’export. Adaptateur R3F dans `apps/web/src/canvas`.
- `apps/web/src/services`: IndexedDB, import, sauvegarde, segmentation et automatisation.
- `apps/web/src/components`: interface shadcn/Radix. État de présentation Jotai, commandes par EnginePort.
- Chaque fichier TypeScript/TSX de `src/` a son test homologue dans `test/`, même chemin et nom `.test.ts(x)`. Aucun test dans src. Maximum 600 lignes par fichier source/script/test (hors lockfiles et documentation).
- Couverture V8: minimum 85% statements, branches, fonctions, lignes; tout le code src inclus, aucune exclusion par commodité. Tests réels de navigateur pour le GPU et exports.
- Les tableaux de calques vont du fond au premier plan. ParentId désigne un groupe; ses enfants ont des coordonnées relatives au groupe. Rotation en degrés autour du centre du calque, x/y coin supérieur gauche. Les groupes sont isolés et ont leurs propres surfaces, effets et masques.
- Export assets originaux intégrés au projet portable JSON `.musart`; aucun serveur requis.
