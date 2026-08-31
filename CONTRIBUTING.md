# Contribuer

Node 20 ou plus récent.

```bash
npm install
npm test         # vitest — inclut un vrai export IBM DOORS en fixture
npm run build    # esm + cjs + .d.ts + style.css dans dist/
npm run typecheck
```

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
- **`scripts/check-docs.mjs`** échoue si un symbole exporté par `src/index.ts` n'est
  documenté nulle part sous `docs/api/`. La liste des exports est lue via le compilateur
  TypeScript, donc `export * from "./types.js"` est développé exactement comme un
  consommateur le voit.
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
