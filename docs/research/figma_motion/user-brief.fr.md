# Verbatim user brief

This is the authoritative, unedited French source for the Motion/video discussion. Spelling, phrasing and tentative statements are preserved deliberately at the user's explicit request to lose none of their words. The specification, research and task documents are written in English. Assistant proposals are not user requirements unless explicitly adopted here.

Messages are numbered chronologically for requirement traceability. The request to avoid premature implementation in M4 applied to the discussion at that point; M6 subsequently authorizes an isolated implementation and agent delegation. M7 requires research, documentation and checklists before implementation tasks are handed out.

## M1

```text
j'y pense, tu vois nos effect,s color etc, je me dit est-ce que c'est dur de mettre l'app en keyframe driven/timeline driven, de manière genre a ce qu'on puisse implémenter du live, c'est à dire que ce soit des vidéo, une caméra, en plus de notre système purement photo right now ?
```

## M2

```text
en soit je veux pouvoir faire des effets vidéos en gros, je parlais pas forcément enfaite de timeline, meme si ta raison faudrait un système de keyframes de chaque truc, un peu à la manière au final, d'un figma motion, c'est donc possible, c'est le plus important, oui les vidéos doivent tourner de manière déterminsite car a l'export faut bien que ce soit propre quoi

animate actuellement c'est plutot un bouton timelapse, il sera surement déplacer
```

## M3

```text
mais si possible garder le système de layers qu'on a . genre en gros sur une vidéo on pourrait mettre des images etc, totalement au dessus etc.. why not tu vois?? mais je me demande comment ca va play ca, paske en soit canvas infini + vidéo et tout, faudrait chosiir si on veux que l'effet soit animé etc, jsp comment le workflow pourrait etre ,j'ai 'limpression que l'app n'est pas prévu for it
```

## M4

```text
non mais attend je ne t'ai pas demander de coder
```

## M5

```text
bah ducoup tu m'as toujours pas dit -_- ma question est surtout coté compositing et aussi genre timeline etc, ca me parait assez complexe car en soit chaque layer peut apparaitre x temps dans la timeline et c'est un peu weird ducoup car il faudrait que la canvas soit crée spéciale pour sa, tu peux pas faire toute une compo image, et puis d'un coup rajouté une vidéo, car aucune image ne sera ajouté en moiton tu vois ?
```

## M6

Attachments supplied with this message, preserved without modification:

- [Image #1 — Figma Motion overview](assets/figma-motion-overview.png), original `/tmp/codex-clipboard-dYeFrg.png`.
- [Image #2 — enlarged timeline detail](assets/figma-motion-tracks.png), original `/tmp/codex-clipboard-0XkXih.png`.

```text
tu penses, tu peux faire un worktree tout àça, ou tu vas travailler sur cette version, j'aime l'idée de crée un canvas statique ou motion mais en vrai je pense que faut plutot avoir motion ou statique sur chaque composition et pouvoir changer de mode quand on veux, juste évidemment on récupèrees les calques une foiset on les met sur toute la durée oui. mais genre si on reswitch sur statique et motion alors on refait pas cette règle, c'est que la première fois quoi.
et si y'a genre plus de 3 items on dit, "{nb} items vont etre ajouté à la timeline etc oui ou non" et tout propre.
il faut qu'en motion ca fasse spawn une timeline que tu peux ouvrir, d'en bas a droite (recentrer la vue tu supprime) et pour les boutons + et - du canvas euuh, j'pense faut le mettre top right avec design et tout, c'est pas si utile

comme ca c'est bon on met la timeline en bas, la timeline doit ressembler à figma motion, cherche refrence et tout[Image #1] ca doit etre exactement meme style qu'eux meme controle etc, bien smooth quoi. avec les memes regles qu'eux et tout, rajouter une keyframes faut l'avoir dans les properties et tout proprement et de la meme manière pour ajouter une keyframes tu cliques sur un ptit truc pour, et après quand tu avances dans la timeline etc, ca met le prochain keyframes direct, tu pourras chosiir les différents algo d'easing etc..[Image #2] met les réferences dans to nworktree etc, fait une branche genre pour sa aussi propre, comm ça on interfères pas les commit du main etc..
ton but est littéralement d'utiliser tes sous agents pour faire un truc de vidéo propre ,je pense que tu peux sois utiliser mediabunny sois threejs pour les vidéos, tu dois géré les performances, c'est très très important que tout sois fluide. rajoute rdes élements dans la timeline doit etre agréable à utiliser, il faut que la timeline soit déterminsite niveau time. rajouter une vidéo va automatiuqement passer la canvas en mode motion. toujours c'est un artboard == une timeline, donc multi timeline possible, mutli tracks etc, pourvoir trimer les tracks etc.. comme un vrai logiciel, comme figma motion informe toi et met tout dans un truc genre docs/research/figma_motion et fait ça svp, tu lances sur le port 6110 pour les motions comme ça tu déranges pas le bun run dev qui tourne deaj avec tes modifs, tout doit etre profiler, aucun lag ne sera toléré, tout doit etre simple à utiliser pas de mauvaise UX et tout, recherche bien comment figma fait, décrit tout correctement de l'ui, à l'ux, et rend ça propre et smooth. tout nos effets doivent pouvoir etre animé, donc en gros ils doivent etre appliqués quoi. c'est dans la timeline etc ca doit etre smooth, et clean, niveau perf, regarde bien les react re render, profile tout, tout doit tourné mieux que du RaF, du 16ms minimum voir mieux, meme pour des heavy compositions, il faut vraiment que ce soit magique. genre en mode "wow ca tourne en browser sa?"
```

## M7

```text
note toutes les idées dans des documentations etc car il ne faut pas perdre un mot de ce que j'ai dit, recap bien ce que je veux, fait des recherches puis prépares des checklist pour les différentes taches, à prendre via des sous agents
```

## M8

```text
si y'a des décision a prendre pose moi les questions, ce qui est sur c'est que mediabunny gèrerea l'export.
```

## M9

```text
et qu'il faut que le scrubing soit instant et tout meme en arirère en avant et tout, ca doit etre wow
```

## M10

Question presented: « Quand tu repasses une composition Motion en Statique, que veux-tu voir et éditer ? Les pistes et keyframes seront conservées dans les deux cas. »

User answer:

```text
Le design de base, avec les animations mises de côté (recommandé)
```

## M11

Question presented: « Pour rendre le scrub très réactif sur les grosses vidéos, acceptes-tu des vidéos d’aperçu optimisées générées localement ? L’export Mediabunny utiliserait toujours les originaux. »

User answer:

```text
Oui, automatiquement si nécessaire (recommandé)
```

## M12

Question presented: « Quelle gestion du son veux-tu dans cette première version vidéo ? »

User answer:

```text
Son des vidéos avec mute et volume par piste (recommandé)
```

## M13

Question presented: « Quand plusieurs compositions Motion sont visibles, que doit lire le bouton Play ? »

User answer:

```text
Seulement la composition active ; les autres restent figées (recommandé pour la fluidité)
```

## M14

Question presented: « Si tu ajoutes une vidéo qui dépasse la fin de la composition, quelle règle veux-tu ? »

User answer:

```text
Allonger la composition si nécessaire, sans raccourcir les pistes existantes (recommandé)
```

## M15

Question presented: « Pour la confirmation « {nb} éléments vont être ajoutés à la timeline », comment doit-on compter les groupes ? Les effets et propriétés ne seront pas comptés comme des éléments indépendants. »

User answer:

```text
Compter chaque calque avec une piste, groupes et sous-calques compris (recommandé)
```

## M16

Question presented: « Le mode caméra était dans ton idée de départ : quelle priorité veux-tu lui donner ? »

User answer:

```text
Une étape suivante, après la vidéo et la timeline stabilisées (recommandé)
```

## M17

Question presented: « Où veux-tu retrouver l’actuel Animate, qui sert au timelapse ? »

User answer:

```text
selon moi c'est dans export tu as un ptit "chevron down" genre le bouton est split et tu peux exporter un timelapse en gros. tu vois
```

## M18

```text
et ducoup animate n'a pas tout ce qu'il y'a, genre juste timelapse va ouvrir un dialog et va dire dans le dialog, bon bah tu peux rejoué sa, blabla, longueur final de la vidéo entre 1 et 30 secondes et bim tu as ton timelapse qui est rejoué plus ou moins rapidement
```

## M19

```text
oublie pas de pointer que tout le moteur de keyframes et tout, tout doit etre générique, genre tout le moteur d'animation etc, doit etre génériuqe, capable en headless d'exister etc, et aussi juste smooth, avec du beau code pas horrible à lire
```

## Reference handling

The screenshots are user-supplied Figma UI references, not MusArt product assets. They document the requested appearance and interaction target; they do not grant a license to redistribute Figma code, brand assets or an external design system inside the application. Preserve MusArt branding and use the repository's genuine shadcn/Radix controls.
