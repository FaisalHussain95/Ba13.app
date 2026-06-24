# Ba13.app — Spécifications fonctionnelles (Cloisons sèches & Faux plafonds)

> Outil de chiffrage mobile pour cloisons sèches et faux plafonds (BA13, ossature métallique) — PWA, sans compte, 100% local.

## 1. Contexte et objectif

Application web mobile-first destinée aux poseurs/artisans en déplacement chez le client, permettant de **chiffrer rapidement le matériel nécessaire** à la réalisation de cloisons en plaques de plâtre (BA13) sur ossature métallique, ainsi que de faux plafonds autoportés, directement depuis un smartphone, sur site, sans connexion garantie.

**Cas d'usage type** : l'artisan prend les mesures chez le client (longueur, hauteur, ouvertures), saisit ces dimensions dans l'app, choisit la configuration (cloison simple/double peau, plafond), et obtient instantanément la liste détaillée et quantifiée du matériel à commander.

---

## 2. Utilisateurs cibles

- Poseurs plaquistes indépendants ou en équipe
- Devant travailler **hors ligne ou en connexion faible** (entrepôts, zones rurales)
- Usage **une main / mobile**, sur chantier, conditions parfois salissantes (gants, écran tactile difficile)

---

## 3. Périmètre fonctionnel

### 3.1 Module Cloison sèche (mur)

**Entrées utilisateur :**
- Longueur du mur (m)
- Hauteur du mur (m)
- Type d'ossature : rail R (largeur 48 / 70 / 90 mm — à définir selon gamme utilisée)
- Configuration de parement :
  - **Double face** (BA13 des deux côtés — cloison complète)
  - **Simple face** (BA13 d'un seul côté, rails nus apparents de l'autre — ex. doublage technique, local non fini)
- Présence d'ouvertures (portes/fenêtres) avec leurs dimensions, à déduire de la surface de plaques
- Isolation (oui/non, type — laine de verre/roche, épaisseur) — optionnel

**Règles de calcul (à valider avec vous, valeurs standard du métier) :**
- Plaque BA13 standard : 1200 × 2500 mm (3 m²) ou 1200 × 3000 mm selon hauteur
- Entraxe montants : 60 cm (standard) ou 40 cm (renfort/charge plus élevée)
- Rails (haut + bas) : 2 × longueur du mur (+ chutes/chevauchements)
- Montants : longueur mur / entraxe + 1, hauteur = hauteur mur (+ marge de coupe)
- **Vis à frapper** (plaque sur ossature) : référence retenue **Vis Plaque de plâtre Diam. 3,5 × 25 mm — boîte de 1000 — ISOLPRO**. Ratio ~25 vis/m² (valeur par défaut réglable, section 7) → conversion automatique en nombre de boîtes de 1000 nécessaires (arrondi supérieur)
- Vis métal/métal (assemblage rails-montants) ou rivets — si applicable
- Chevilles/fixations rail au sol et plafond (selon support : béton, autre)
- Bandes à joint + enduit (calcul au mètre linéaire de joints)
- **Si simple face** : pas de plaques côté "nu", mais l'ossature reste identique → le calcul de plaques est divisé par 2, le reste (rails/montants/visserie structure) ne change pas

### 3.2 Module Portes (intégré au calcul cloison)

**Référence retenue** : **Bloc-porte postformé prépeint, alvéolaire, huisserie 72 mm — marque CHAUVAT** (vendu chez Bricoman, disponible en 63/73/83/93 cm de largeur, poussant droit ou gauche).

| Caractéristique | Valeur (modèle 83 cm) |
|---|---|
| Largeur porte | 83 cm |
| Hauteur porte | 204 cm |
| Épaisseur porte | 40 mm |
| Section huisserie | 72 × 45 mm (bois sapin) |
| Largeur hors tout (avec huisserie) | 89,7 cm |
| Hauteur hors tout (avec huisserie) | 208 cm |
| Largeurs disponibles | 63 / 73 / 83 / 93 cm |
| Sens d'ouverture | Poussant droit / Poussant gauche |

➡️ **Conséquence sur le calcul de l'ouverture dans la cloison** : la réservation à prévoir dans l'ossature doit correspondre aux **dimensions hors tout** (89,7 × 208 cm pour le modèle 83 cm), pas aux dimensions de la porte seule, puisque c'est le bloc complet (huisserie incluse) qui s'insère dans l'ouverture du mur. L'app calcule donc la réservation = largeur/hauteur hors tout + jeu de pose (quelques mm, réglable).

**Entrées utilisateur par porte :**
- Largeur du bloc-porte souhaité, parmi les références disponibles (63/73/83/93 cm)
- Sens d'ouverture (poussant droit/gauche) — informatif, sans impact sur le calcul matière
- Le bloc-porte complet (huisserie comprise) est ajouté comme **ligne fourniture** dans la BOM (pas juste un calcul de renfort)

**Éléments à ajouter au calcul (par porte) :**
- **Le bloc-porte lui-même** (référence Bricoman ci-dessus) comme article de la liste de matériel
- **Montants doublés (renforcés)** de part et d'autre de la réservation hors tout, sur toute la hauteur — pour reprendre la charge et fixer l'huisserie
- **Traverse/linteau horizontal** au-dessus de la réservation (rail ou profil découpé + renfort), reliant les deux montants renforcés
- **Montant(s) complémentaire(s) au-dessus du linteau** jusqu'au rail haut si la hauteur de réservation n'atteint pas le plafond (entraxe standard maintenu)
- Déduction de la surface de réservation dans le calcul des plaques BA13 (les deux faces si double face, une seule si simple face)
- Chutes de plaques au-dessus/à côté de la réservation (non optimisées — voir section 3.4)
- Visserie supplémentaire pour la fixation des montants doublés entre eux et du linteau

**Affichage résultat :** le matériel lié aux portes apparaît comme une sous-ligne identifiable dans le devis (ex. "Porte 1 — Bloc-porte 83 cm CHAUVAT + renfort ossature"), pour que l'utilisateur puisse vérifier/ajuster facilement.





**Déclenchement** : proposé automatiquement si l'utilisateur indique une **hauteur sous plafond élevée** (seuil à définir, ex. > 3 m ou > 4 m — entrepôt) et souhaite créer un plafond suspendu à base de rails (structure autoportante, sans suspentes sur plafond existant, ou avec suspentes selon portée).

**Entrées :**
- Surface du plafond (longueur × largeur) ou dimensions de la pièce
- Hauteur disponible
- Portée entre appuis/murs porteurs

**Règle métier — basée sur le NF DTU 25.41 (révision 2022) :**

Le DTU distingue le **plafond autoportant** (ossature en montants prenant appui mur à mur, sans suspente) du **plafond suspendu** (suspentes accrochées au support existant). L'app ne doit proposer l'autoportant que dans la limite de portée admissible :

| Configuration montant | Entraxe | Portée max indicative |
|---|---|---|
| Montant simple M48 | 60 cm | ≈ 2,00 m |
| Montants doublés (dos à dos) M48/M100 | 60 cm | ≈ 3,90 – 4,00 m |
| Au-delà de ~4 m | — | **Solution autoportante interdite** |

> ⚠️ Ces valeurs dépendent aussi de la charge d'isolant et de la charge de vent (10 daN/m² par défaut dans le DTU) — elles sont **indicatives** et devront être affinées avec les abaques du fabricant retenu (Placo, Siniat, Pladur...) avant mise en production. Idéalement, ces seuils sont **paramétrables** dans les réglages de l'app plutôt que figés en dur dans le code.

**Comportement attendu de l'app :**
- Portée ≤ seuil montant simple → propose montant simple, entraxe 60 cm (ou 40 cm si charge isolant élevée)
- Portée entre les deux seuils → impose montants doublés, signale l'obligation
- Portée > seuil max (≈ 4 m) → **bloque la solution autoportante**, affiche un message d'avertissement et oriente vers : plafond suspendu classique (suspentes au support existant) ou poutre de soutien intermédiaire / avis d'un bureau d'études
- Hauteur de cloison (mur) : rappel des plafonds DTU — 6,35 m max en parement 1 plaque, 6,85 m max en 2 plaques (montants doublés) — à vérifier également si pertinent pour votre cas d'entrepôt

### 3.3 Stratégie de calcul des chutes

**Décision retenue : pas d'optimisation des chutes en V1.** Conformément à la pratique de terrain (l'artisan en déplacement privilégie la rapidité de pose à l'économie de matière), l'app calcule les quantités par **arrondi simple à l'unité supérieure** pour chaque référence (plaque, montant, rail), sans algorithme de découpe optimisée ni réemploi des chutes d'une zone à l'autre.

- Exemple : un mur de 3,40 m de long avec montants entraxe 60 cm → calcul direct du nombre de montants nécessaires sans chercher à réutiliser la chute d'un montant coupé ailleurs sur le chantier
- Cette approche reste cohérente avec le calcul des longueurs de montants (section 7.4) : on prend la longueur commercialisée immédiatement supérieure au besoin, chute non réutilisée
- Possibilité d'ajouter plus tard (V2+) une option "mode économe" avec optimisation des chutes, si le besoin émerge, mais non prioritaire



### 3.4 Sortie / Livrable

- Liste de matériel quantifiée (désignation, quantité, unité), avec le bloc-porte intégré comme article de fourniture
- Regroupement par catégorie (ossature / parement / visserie / portes / finition / isolation)
- Export CSV (voir section 9.4) pour envoi au fournisseur ou au client
- Possibilité d'ajuster manuellement une quantité avant export

---

## 4. Contraintes techniques

| Contrainte | Détail |
|---|---|
| Plateforme | Web app, **mobile-first**, responsive |
| Connectivité | Fonctionnement **offline** souhaitable (PWA — Progressive Web App, installable, cache local) |
| Saisie | Champs numériques optimisés tactile, claviers adaptés, peu de frappe texte |
| Stockage | Sauvegarde locale des chantiers/devis en cours

---

## 5. Points ouverts à trancher avec vous avant de démarrer le dev

1. ~~Ratio vis à frapper/m²~~ → **Tranché** : référence vis ISOLPRO 3,5×25mm boîte de 1000, ratio par défaut 25 vis/m² réglable (voir sections 3.1 et 6)
2. Confirmer/affiner les seuils de portée plafond autoportant (2 m / 4 m) avec l'abaque du fabricant que vous utilisez réellement sur chantier
3. ~~Gestion des chutes~~ → **Tranché** : pas d'optimisation en V1, arrondi simple à l'unité supérieure (voir section 3.3)
4. ~~Multi-chantiers~~ → **Tranché** : gestion multi-projets en local sans compte (voir section 9)
5. ~~Export~~ → **Tranché** : export CSV de la BOM (voir section 9.4)
6. ~~Portes~~ → **Tranché** : le bloc-porte complet (référence CHAUVAT/Bricoman) est inclus comme fourniture dans la BOM, en plus du renfort d'ossature (voir section 3.2)
7. ~~Compatibilité montant/rail~~ → **Tranché** : rail standard fixe par largeur (aile 28mm), montant variable selon le besoin (voir section 7.2)

**Seul point réellement encore ouvert : le seuil de portée du plafond autoportant (point 2), à confirmer avec votre pratique terrain — mais il est déjà réglable dans l'app donc non bloquant pour démarrer le développement.**

---

## 6. Paramètres réglables (écran Réglages)

Pour éviter de figer en dur des valeurs métier qui dépendent du fabricant/contexte, les seuils suivants sont exposés dans un écran "Réglages", avec une valeur par défaut pré-remplie (issue du DTU 25.41) modifiable par l'utilisateur :

| Paramètre | Valeur par défaut | Unité |
|---|---|---|
| Portée max plafond autoportant — montant simple | 2,00 | m |
| Portée max plafond autoportant — montants doublés | 4,00 | m |
| Entraxe montants cloison (standard) | 60 | cm |
| Entraxe montants cloison (renforcé) | 40 | cm |
| Hauteur max cloison — 1 plaque | 6,35 | m |
| Hauteur max cloison — 2 plaques | 6,85 | m |
| Ratio vis à frapper | 25 | vis/m² |
| Dimensions plaque BA13 par défaut | 1200 × 2500 | mm |

**Implémentation :** simple objet de config stocké en local (localStorage/IndexedDB), avec bouton "Réinitialiser aux valeurs par défaut". Pas de complexité additionnelle côté UI : les écrans de saisie/calcul lisent ces valeurs au lieu de constantes codées en dur. Coût de dev marginal, comme vous le pressentiez.

---

## 7. Gamme matériel — Référence Bricoman

### 7.1 Montants (marque ISOLPRO)

| Largeur montant | Longueurs disponibles | Usage typique |
|---|---|---|
| 36 mm | 3 m | Doublage léger |
| 48 mm (46,5) | 2,5 / 2,6 / 2,7 / 2,8 / 3 / 4 m | Cloison standard, plafond entraxe ≤ 2m |
| 62 mm | 3 / 3,5 m | Cloison intermédiaire |
| 70 mm (68,5–69,5) | 2,5 / 3 / 4 m | Cloison renforcée, isolation épaisse |
| 90 mm | 3 m | Cloison forte épaisseur |
| 100 mm | 3 m | Cloison/plafond grande portée (montants doublés) |

> Hauteur de profil (aile) montant : 35 mm.

### 7.2 Rails (marques ISOLPRO et PLACO)

Important : contrairement aux montants, **les rails sont vendus en longueur unique de 3 m**, quelle que soit la largeur. Les largeurs disponibles diffèrent légèrement de celles des montants :

| Largeur rail | Longueur | Aile (mm) | Marque |
|---|---|---|---|
| 36 mm | 3 m | 28 | ISOLPRO |
| 48 mm | 3 m | 28 | ISOLPRO |
| 48 mm | 3 m | 35 | PLACO |
| 62 mm | 3 m | 35 | ISOLPRO |
| 70 mm | 3 m | 28 | ISOLPRO |
| 70 mm | 3 m | 35 | PLACO |
| 90 mm | 3 m | 28 | ISOLPRO |
| 100 mm | 3 m | 28 | ISOLPRO |
| 125 mm | 3 m | 28 | ISOLPRO |
| 150 mm | 3 m | 28 | ISOLPRO |

⚠️ **Point d'attention technique pour le calcul :** l'aile du rail (28 mm) n'est pas toujours identique à celle du montant correspondant (35 mm).

**Décision retenue :** on fige le **rail en référence standard fixe** (aile 28 mm, marque ISOLPRO, longueur 3 m) pour chaque largeur, et seul le **montant varie selon le besoin** (épaisseur de cloison, charge, hauteur). Le couple est donc : *largeur identique entre montant et rail, aile rail toujours 28 mm*.

| Largeur | Rail (fixe) | Montant (variable selon besoin) |
|---|---|---|
| 36 mm | Rail 36/28 ISOLPRO — 3 m | Montant 36/35 ISOLPRO — 3 m |
| 48 mm | Rail 48/28 ISOLPRO — 3 m | Montant 48/35 ISOLPRO — 2,5 / 2,6 / 2,7 / 2,8 / 3 / 4 m |
| 62 mm | Rail 62/35 ISOLPRO — 3 m* | Montant 62/35 ISOLPRO — 3 / 3,5 m |
| 70 mm | Rail 70/28 ISOLPRO — 3 m | Montant 70/35 ISOLPRO — 2,5 / 3 / 4 m |
| 90 mm | Rail 90/28 ISOLPRO — 3 m | Montant 90/35 ISOLPRO — 3 m |
| 100 mm | Rail 100/28 ISOLPRO — 3 m | Montant 100/35 ISOLPRO — 3 m |

*\* Exception 62 mm : seul rail disponible en aile 35 mm chez ISOLPRO — pas de version 28 mm référencée, donc le couple utilise l'aile 35 par défaut pour cette largeur.*

Ce choix simplifie le moteur de calcul : une seule référence de rail par largeur (quantité = mètres linéaires / 3, arrondi supérieur), et un choix de longueur de montant parmi les options disponibles pour la largeur sélectionnée.

**Conséquence sur le calcul de rails :** comme la longueur est fixe à 3 m, le nombre de rails = arrondi supérieur de (longueur du mur ou du plafond / 3 m), pour chaque rail haut et bas (cloison) ou périphérique (plafond) — pas de choix de longueur à faire comme pour les montants, juste une quantité.

### 7.3 Plaques BA13

Référence retenue : **Plaque de plâtre BA13 standard H.250 × l.120 cm NF — LABELPLAC** (épaisseur 12,5 mm, surface 3 m²/plaque).

| Caractéristique | Valeur |
|---|---|
| Dimensions | 2500 × 1200 mm |
| Épaisseur | 12,5 mm |
| Surface unitaire | 3 m² |
| Poids | ~26,1 kg/plaque |

➡️ Cette référence devient la **valeur par défaut** du paramètre "Dimensions plaque BA13" évoqué section 6 (déjà 1200 × 2500 — confirmé, juste l'ordre H × l à harmoniser dans l'interface).

### 7.4 Conséquences générales sur le calcul
- L'app propose une **largeur de montant par défaut selon l'épaisseur de cloison souhaitée** (ex. 48 mm le plus courant), modifiable par l'utilisateur
- Pour la **longueur des montants** : calcul du nombre de barres en tenant compte des longueurs commercialisées disponibles (ex. hauteur de mur 2,80 m → barre 2,80 m si disponible, sinon longueur supérieure la plus proche, avec calcul de la chute)
- Pour les **rails** : quantité simple = longueur totale à couvrir / 3 m (arrondi supérieur), indépendamment de la hauteur
- Affichage du **nombre d'unités à acheter par référence exacte** (ex. "12 × Montant 48/35 ISOLPRO — Long. 3 m", "4 × Rail 48/28 ISOLPRO — Long. 3 m", "18 × Plaque BA13 standard 250×120 LABELPLAC"), directement exploitable pour la commande en magasin
- Prix non intégré en V1 (tarifs fluctuants), mais structure de données prévue pour ajouter un coût unitaire par référence si besoin plus tard



---

## 8. Spécifications UI/UX

Pas de maquette formelle nécessaire — le besoin reste simple et directement descriptible :

### 8.1 Principe général
- Interface **mobile-first**, utilisable au doigt sur chantier
- Écran central : un **éditeur de plan interactif** (vue du dessus, schématique) permettant de dessiner/positionner les éléments de la pièce à cloisonner, plutôt que de tout saisir via des champs de formulaire

### 8.2 Données saisies sur le plan interactif
- Tracé des murs de la pièce (longueurs, angles simples — rectangle ou forme libre selon V1/V2)
- Pour chaque mur/cloison à créer : possibilité de saisir une **hauteur spécifique si différente de 2,50 m** (valeur par défaut)
- Indication de la **présence ou non d'un plafond existant** :
  - Si oui → hauteur sous plafond standard, pas de proposition de faux plafond autoportant
  - Si non (entrepôt, hauteur libre) → champ pour saisir la **hauteur sous plafond réelle**, déclenchant la logique du module Faux plafond (section 3.3) si pertinent
- Saisie de la **hauteur de la pièce à cloisonner** (peut différer de la hauteur sous plafond si on ne monte pas jusqu'en haut — ex. cloison partielle)
- Positionnement des **portes** directement sur le tracé du mur concerné (point cliqué/tapé sur le mur → ouverture insérée, dimensions modifiables ensuite)
- *Réservé pour une itération future* : positionnement des **fenêtres** (même logique d'insertion que les portes, déduction de surface, mais pas de renfort structurel équivalent à prévoir à ce stade)

### 8.3 Résultat
- Une fois le plan validé, l'app bascule sur l'écran de résultat (liste de matériel quantifiée, section 3.3/7) calculée à partir des éléments dessinés

### 8.4 Conséquence sur le développement
- Pas de phase de maquettage Figma/wireframe dédiée
- Le développement peut démarrer directement sur le composant d'édition de plan (le plus complexe techniquement), en V1 sous forme de rectangle simple avec murs éditables, portes positionnables ; les formes plus complexes et les fenêtres arrivent en V2/V3

## 9. Gestion des données et persistance (sans compte)

### 9.1 Principe
- **Pas de création de compte, pas de backend de stockage utilisateur** — tout reste local, côté navigateur
- L'app doit fonctionner immédiatement à l'ouverture, sans étape de login/inscription

### 9.2 Stockage local
- Technologie : **IndexedDB** recommandé (plutôt que localStorage brut ou cookies), car :
  - Pas de limite de taille restrictive (localStorage ~5 Mo, cookies inadaptés à du JSON volumineux)
  - Adapté à du contenu structuré (projets, murs, ouvertures) sans tout sérialiser/désérialiser en JSON à chaque accès
  - Cohérent avec le besoin offline/PWA déjà identifié (section 4)
- localStorage peut servir uniquement pour de petites préférences ponctuelles (ex. dernier projet ouvert, réglages section 7), IndexedDB pour les données de projet elles-mêmes
- Cookies à exclure (pas adaptés, et inutiles puisqu'aucune communication serveur n'est nécessaire pour cette fonction)

### 9.3 Gestion de projets
- **Écran d'accueil** : à l'arrivée, l'utilisateur voit soit la liste de ses projets existants (nom, date de dernière modification, miniature du plan si simple), soit directement une invitation à créer un nouveau projet si aucun n'existe
- **Créer un projet** : l'utilisateur saisit un nom (ex. "Entrepôt Dupont — Bureau") → un nouveau projet vide est créé et sauvegardé localement
- **Reprendre un projet** : sélection dans la liste → reprise exacte de l'état (plan dessiné, hauteurs, portes, réglages spécifiques au projet si différents des réglages globaux)
- **Sauvegarde automatique** : à chaque modification du plan (ajout mur/porte, changement hauteur...), sauvegarde immédiate en local — pas de bouton "Enregistrer" explicite nécessaire, pour éviter toute perte sur chantier (coupure, fermeture accidentelle de l'app)
- **Suppression de projet** : possibilité de supprimer un projet de la liste (avec confirmation, action irréversible puisque tout est local)
- ⚠️ **Limite à communiquer à l'utilisateur** : les données étant stockées dans le navigateur de l'appareil utilisé, elles ne sont pas synchronisées entre appareils et peuvent être perdues en cas de réinitialisation du téléphone, changement de navigateur, ou nettoyage du cache. Pas de sauvegarde cloud prévue en V1.

### 9.4 Export CSV de la BOM (Bill of Materials)
- Sur l'écran de résultat (liste de matériel — sections 3.4/8), un bouton **"Exporter en CSV"**
- Contenu du CSV : une ligne par référence, avec au minimum les colonnes : `Catégorie | Désignation | Référence | Largeur/Dimension | Longueur | Quantité | Unité`
- Le fichier est généré côté client (pas d'envoi serveur) et proposé en téléchargement via le navigateur (ou partage natif mobile si disponible)
- Nom de fichier suggéré : `BOM_<nom-du-projet>_<date>.csv`
- Cet export reste lisible/réutilisable dans Excel, Google Sheets, ou réimportable dans un logiciel de devis si besoin — répond aussi au point ouvert n°5 (export) déjà identifié, sans complexifier avec un format propriétaire



1. Valider ce document (corrections/ajouts)
2. Définir précisément les formules de calcul restantes (ratio vis, marge chutes)
3. Développement V1 : éditeur de plan interactif (rectangle simple, murs éditables, hauteurs, portes) + moteur de calcul cloison/portes
4. V2 : ajout module faux plafond avec seuils réglables
5. V3 : fenêtres + formes de plan plus complexes



