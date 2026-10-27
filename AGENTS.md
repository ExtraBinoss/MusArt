# MusArt — règles de contribution

Ce projet est un éditeur créatif local-first. Lire `PLAN_UNIVERSEL_EDITEUR_CREATIF.md` et `docs/CONTRACTS.md` avant de changer les contrats. Les consignes directes de l’utilisateur priment.

## Architecture et organisation

- Ranger le code par responsabilité dans des sous-dossiers: `document/`, `layers/`, `history/`, `effects/`, `selection/`, `projects/`, etc. Ne pas accumuler vingt fichiers de fonctionnalités différentes à la racine d’un module. Un point d’entrée public court reste autorisé.
- `packages/core`: modèle versionné, validations, géométrie, commandes atomiques, historique; TypeScript pur, sans DOM, React, Jotai, Three ou stockage.
- `packages/render`: sources et surfaces, composition isolée, passes GPU, caches et export. Les documents ne contiennent jamais de ressources GPU.
- `apps/web`: interface, état de présentation, viewport R3F et adaptateurs plateforme. Toute mutation documentaire passe par `EnginePort`; boutons, clavier et automatisation utilisent les mêmes commandes.
- Les modules réutilisables exposent une petite API via les exports du package. Ne pas créer un fichier utilitaire géant ni découper artificiellement un comportement en wrappers vides.

## Stack et rendu

- React, TypeScript strict, Vite, Bun, Tailwind, Jotai, Motion, i18next FR/EN, lucide et véritables composants shadcn/Radix avec provenance conservée.
- Three.js `WebGPURenderer` (`three/webgpu`), React Three Fiber et TSL (`three/tsl`). Le fallback WebGL2 utilise le même renderer et les mêmes nodes TSL. Ne pas introduire `WebGLRenderer`, `ShaderMaterial`, `RawShaderMaterial` ou de shaders GLSL parallèles.
- Rendu à la demande. Pas de boucle permanente au repos. Les effets et masques restent confinés à leur calque ou groupe; préserver l’alpha.
- Preview transitoire pendant les gestes, une seule commande/historique au commit. Caches bornés et ressources/timers/listeners/workers explicitement libérés.
- Molette/trackpad: déplacement X/Y; Ctrl/Cmd+molette: zoom autour du curseur. 100% recentre la vue; un bouton permet de retrouver le document.

## Pipeline GPU obligatoire

- Chaque effet possède son propre dossier (`effects/dither/`, `effects/ascii/`, etc.), avec son builder TSL, ses helpers et tests miroir. Le registre est une table de définitions; aucun gros switch regroupant la logique des effets.
- L’aperçu conserve sources, sorties d’effets, groupes, masques et composition sur le GPU. Ping-pong de RenderTargets; la texture finale est présentée directement par R3F. Ne pas rapatrier un résultat GPU dans une surface Canvas2D ou un tableau JavaScript.
- Aucun `readRenderTargetPixels*`, `readPixels` ou `GPUBuffer.mapAsync(READ)` dans le code de rendu de production. L’export rend sur un canvas GPU et utilise l’encodeur navigateur. La préparation des sources texte et le décodage d’une image originale sont distincts d’un readback GPU.
- Les paramètres interactifs sont des uniforms stables. Pan/zoom ne recalculent pas les sources; déplacer un calque ne réuploade pas son image. Grouper les calques compatibles dans une même passe; les mélanges complexes et effets restent en passes séparées.
- Avant livraison, exécuter une charge reproductible de **50 calques image avec effets**, photos locales dans `public/benchmark/`, avec captures et mesures froid/chaud, interactions, mémoire, repos et export. Instrumenter les vraies APIs de lecture pour prouver zéro readback; ne pas se contenter d’un compteur constant.
- Faire une revue indépendante par sous-agents des domaines UI, moteur et rendu une fois l’implémentation stabilisée, puis corriger les problèmes et relancer les vérifications concernées.
- Conserver les sources primaires et notes Three/WebGPU/TSL dans `docs/rendering/` avec version et date, pour réutiliser les acquis.

## Qualité bloquante

- Aucun test, `.test.*`, `.spec.*`, dossier `test/`, `tests/` ou `__tests__/` sous un dossier `src/`.
- Chaque source exécutable possède son test miroir sous `test/`: `src/layers/tree.ts` → `test/layers/tree.test.ts`. Même règle pour les applications et packages. Les déclarations `.d.ts` sans exécution sont exemptées.
- Maximum **600 lignes** par fichier de code, script et test. Répartir par responsabilité réelle avant de dépasser cette limite.
- Minimum **85% chacune**: lignes, statements, fonctions, branches; inclure toutes les sources, même non importées. Seuil indépendant pour le cœur/moteur. Ne pas exclure du code difficile, ajouter des ignores de couverture ou baisser les seuils pour faire passer une commande.
- Tester les valeurs et comportements, erreurs, atomicité, undo/redo, confinement des effets, alpha, sauvegarde/rechargement, worker obsolète et cleanup. Ne pas remplacer une assertion métier par un snapshot ou une vérification sans sens.
- Vérification réelle en navigateur headless pour le rendu GPU, les gestes, les exports lisibles et les captures d’écran. Un build ou un mock de GPU n’est pas un test de rendu réel.
- Zéro manquement au script déterministe `bun run check:rules`; après couverture utiliser `bun scripts/check-rules.ts --coverage`.

## Vérification et livraison

- `bun install --frozen-lockfile`, `bun run typecheck`, `bun run lint`, `bun run format:check`, `bun run test:coverage`, `bun run test:browser`, `bun run build`.
- Les tests navigateur doivent aussi passer sur le build de production. Conserver captures et rapports dans `artifacts/` (ignoré par Git).
- Sauvegarde IndexedDB atomique, autosave regroupée, projet portable contenant les originaux; aucune dépendance serveur pour créer/éditer/sauvegarder/exporter. Un téléchargement initial explicite est autorisé pour le modèle local de segmentation.
- Valider toute donnée importée. Erreurs compréhensibles et visibles, jamais de succès simulé. Ne pas annoncer de performances, couverture ou compatibilité sans mesure exécutée.
- Conserver les licences et provenances des composants, modèles, effets et images. Dépendances verrouillées avec un seul `bun.lock`.

## Git et jalons

- Le dépôt est suivi avec Git dès le démarrage. Créer un commit distinct à chaque jalon vérifié ou fonctionnalité terminée ; ne pas attendre la fin du projet pour tout regrouper.
- Avant un commit, exécuter les vérifications pertinentes de son périmètre. Un commit de fonctionnalité ne doit pas masquer des échecs connus dans cette fonctionnalité.
- Utiliser des messages explicites (`feat(core): ...`, `feat(render): ...`, `test(performance): ...`, `fix(...): ...`) et un périmètre cohérent.
- Sélectionner les fichiers du jalon ; ne pas embarquer des modifications sans rapport, des secrets, `node_modules/`, `dist/`, `coverage/` ou `artifacts/`. Les photos de fixtures locales et leur licence/provenance font partie des sources autorisées.
- Préserver l’historique et les changements de l’utilisateur. Ne pas réécrire ou publier l’historique sans instruction.
