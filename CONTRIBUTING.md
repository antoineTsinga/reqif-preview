# Contribuer

Node 20 ou plus récent.

```bash
npm install
npm test         # vitest — inclut un vrai export IBM DOORS en fixture
npm run build    # esm + cjs + .d.ts + style.css dans dist/
npm run typecheck
```

## Mesurer

Les décisions de performance de ce dépôt reposent sur ces trois bancs, pas sur
l'intuition. Chacun a son périmètre, et aucun chiffre ne se cite sans dire duquel il vient.

```bash
npm run bench              # par phase, un process enfant par fixture
npm run bench:browser      # insertion DOM + plus longue tâche, à lire dans le navigateur
npm run bench:code         # contrôles fonctionnels, puis mesures d'appels d'API Node
npm run bench:code:checks  # les seuls contrôles fonctionnels, sans mesure
```

`bench:code` exécute 18 contrôles fonctionnels qui **échouent en se nommant**, génère des
entrées reproductibles dont il vérifie l'empreinte, et utilise un processus neuf par cas,
par phase et par répétition pour ses mesures de temps. Ses mesures mémoire passent par des
processus distincts, avec un seul chargement et rendu, sans chauffe : leur RSS reste le pic
absolu d'un processus entier, pas une allocation supplémentaire ni la RAM minimale requise.
Ses opérations chronométrées se recouvrent, donc leurs temps ne sont pas des parts de
pipeline — et il ne mesure que des appels d'API Node, jamais l'insertion dans le DOM ni une
latence perçue.

`bench` rapporte le plus-haut RSS d'un processus qui enchaîne plusieurs phases et
répétitions pour une fixture : ce compteur ne décrit donc pas un chargement unique. Il
génère à la demande une fixture synthétique de ~50 Mo dans `.bench/`, gitignorée. L'export
DOORS de 5 Mo est gitignoré lui aussi : s'il manque, le cas est ignoré et le banc le dit,
plutôt que de laisser lire un tableau incomplet comme s'il était complet.

`bench:browser` conserve un ordre fixe des variantes : ses écarts ne permettent pas
d'isoler l'effet du mode.

## Le site de documentation

```bash
npm run docs:dev       # build, synchronise les actifs, sert en développement
npm run docs:build     # ce que la CI exécute
npm run docs:preview   # sert le site construit
```

Trois scripts s'exécutent dans `docs:build`. Les deux derniers **font échouer le build** :
une documentation ne reste alignée sur le code que si un écart casse quelque chose.

- **`scripts/sync-docs-assets.mjs`** copie `dist/index.js` vers `docs/public/`, régénère le
  `.reqifz` d'exemple et produit l'illustration de la page d'accueil en rendant ce paquet.
  Ces trois sorties sont gitignorées : ce sont des artefacts, jamais du contenu de dépôt.
- **`scripts/check-docs.mjs`** fait deux contrôles, tous deux dérivés du code par le
  compilateur TypeScript plutôt que d'une liste à tenir à jour à la main.

  Il échoue si un symbole exporté par `src/index.ts` n'est documenté nulle part sous
  `docs/api/`. La liste des exports étant lue par le compilateur, `export * from
  "./types.js"` est développé exactement comme un consommateur le voit.

  Il échoue aussi si un bloc ```` ```ts interface X { … } ```` d'une page ne liste pas les
  bons membres. Le premier contrôle ne suffit pas : un champ ajouté à `RenderLabels` a
  déjà échappé à la doc sans rien casser, le nom `RenderLabels` restant mentionné. La
  comparaison est volontairement asymétrique — un champ **déclaré sur** l'interface et
  absent du bloc est une erreur, alors qu'un champ du bloc n'en est une que s'il n'existe
  nulle part, héritage compris. Les pages utilisent les deux styles : certaines s'appuient
  sur `extends`, d'autres aplatissent un champ venu d'une base non exportée, et les deux
  sont honnêtes. Un bloc partiel à dessein se marque comme ci-dessous.
- **`scripts/check-doc-examples.mjs`** échoue si un exemple de code utilise une variable
  dont on ne connaît pas la provenance. Il compile chaque bloc et ne signale que
  « Cannot find name » ; un bloc partiel à dessein se marque au-dessus par
  `<!-- exemple: extrait — la raison -->`, la raison étant obligatoire.

Le préambule contre lequel les exemples sont vérifiés est lu depuis
`docs/_conventions.md` — le texte même que le lecteur voit — pour que le vérificateur ne
puisse pas supposer ce que la documentation ne dit pas.

`scripts/emit-style.mjs` écrit `dist/style.css` en relisant `DEFAULT_CSS` dans le bundle
construit, pour que le fichier et le `<style>` injecté ne puissent pas diverger.

## Publier une version

La publication passe par une Release GitHub. Aucun jeton npm n'est stocké dans le dépôt :
`.github/workflows/release.yml` s'authentifie par OIDC auprès de npm.

```bash
npm version patch      # ou minor / major — crée le commit et le tag
git push --follow-tags
```

Puis, sur GitHub : **Releases → Draft a new release**, choisir le tag, rédiger les notes,
**Publish release**. Le workflow refuse de partir si le tag contredit `package.json`, ou si
la version est déjà sur npm — c'est la seule erreur irrattrapable, npm ne remplace jamais
une version publiée.

## Notes d'implémentation

`ALGORITHMES.md` explique comment le parseur, l'index et le renderer sont construits, et
pourquoi. À lire avant de toucher à `src/`.
