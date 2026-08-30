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
  - title: Rien ne casse après le parsing
    details: >-
      Une entrée surprenante dégrade localement, le reste du document se rend
      quand même. onDegradation rend visibles ces quatorze décisions silencieuses
      quand vous en avez besoin.
    link: /guide/diagnostics
    linkText: Diagnostics
  - title: Contenu tiers traité comme tel
    details: >-
      Liste blanche stricte de balises et d'attributs, alignée sur les modules
      XHTML autorisés par la spec. Scripts, iframes et schémas d'URL exécutables
      sont neutralisés.
    link: /guide/securite
    linkText: Sécurité
  - title: Plusieurs documents, un lien qui marche
    details: >-
      Onglets en CSS pur, sans JavaScript. Le fragment d'URL décide du panneau
      affiché — un lien vers une exigence rouvre le bon document, la bonne
      spécification, défilé jusqu'à elle.
    link: /guide/mise-en-page
    linkText: Onglets et numérotation
  - title: Conforme à OMG ReqIF v1.2
    details: >-
      formal/2016-07-01. Y compris les recoins : theOriginalValue, AlternativeID,
      relations GLOBAL-REF entre documents d'un même paquet, EDITABLE-ATTS.
    link: /api/modele
    linkText: Modèle
---

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
