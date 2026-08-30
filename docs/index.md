---
layout: home

hero:
  name: reqif-preview
  text: ReqIF et ReqIFZ, affichés sans effort
  tagline: >-
    Parser et prévisualiser des exigences ReqIF dans le navigateur ou côté
    Node.js. Aucune dépendance à React, Vue ou Angular — un modèle typé d'un
    côté, du HTML prêt à afficher de l'autre.
  actions:
    - theme: brand
      text: Démarrer
      link: /guide/demarrage
    - theme: alt
      text: Bac à sable
      link: /bac-a-sable
    - theme: alt
      text: Référence API
      link: /api/
    - theme: alt
      text: GitHub
      link: https://github.com/antoineTsinga/reqif-preview

features:
  - title: Deux lignes pour un aperçu
    details: >-
      loadReqIfPackage détecte seul le XML brut ou l'archive zip, extrait les
      pièces jointes ; renderPackageToHtml rend un bloc HTML autonome, avec sa
      propre feuille de style.
    link: /guide/demarrage
    linkText: Démarrage rapide
  - title: Ou votre propre rendu
    details: >-
      Un modèle de données typé, acyclique et sérialisable, fidèle au modèle UML
      de la spec. Les références croisées restent des chaînes ; ReqIfIndex les
      résout en O(1).
    link: /guide/rendu-maison
    linkText: Modèle de données
  - title: Conforme à OMG ReqIF v1.2
    details: >-
      formal/2016-07-01. Le modèle de données suit la spec de près, cas limites
      compris, plutôt qu'un sous-ensemble commode.
    link: /api/modele
    linkText: Modèle
---

<HeroPreview />

## En trois lignes

```ts
import { loadReqIfPackage, renderPackageToHtml } from "reqif-preview";

const fileBytes = new Uint8Array(await (await fetch("/exigences.reqifz")).arrayBuffer());
const pkg = await loadReqIfPackage(fileBytes); // .reqif ou .reqifz, auto-détecté
document.getElementById("preview").innerHTML = await renderPackageToHtml(pkg);
```

C'est tout pour le cas simple. Le résultat est un bloc HTML autonome — arborescence
des spécifications, texte enrichi (gras, italique, listes, tableaux), images
intégrées en `data:` URI — avec son propre `<style>` scopé sur `.reqif-preview`.

<div class="tip custom-block" style="padding-top: 8px">

Envie d'essayer sur **votre** fichier avant d'installer quoi que ce soit ?
Le [bac à sable](/bac-a-sable) exécute la vraie bibliothèque dans votre
navigateur : rien n'est envoyé nulle part.

</div>
