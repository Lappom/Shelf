---
name: epub-three-way-merge
description: Gère l’ingestion EPUB, l’extraction et la synchronisation des métadonnées avec three-way merge (EPUB vs DB vs snapshot) et l’écriture retour dans l’EPUB. À utiliser quand on parle d’EPUB, OPF, metadata sync, merge, snapshot, ou writeback.
---

# EPUB three-way merge

## Invariants

- Toujours recalculer `content_hash` après toute modification de fichier.
- En conflit : **EPUB gagne**.
- Si DB gagne (EPUB == snapshot, DB ≠ snapshot) : écrire DB → EPUB + mettre à jour snapshot.

## Champs (V1)

Écrire seulement un set stable :
- title, authors, language, publisher, publish_date, identifiers (ISBN), description

## Validation & risques

- Valider ZIP, limiter la taille, se protéger des zip bombs.
- Ne pas exécuter de contenu provenant de l’EPUB.

## Tests à exiger

- [ ] Cas 1: aucune modif (EPUB/DB/snapshot identiques)
- [ ] Cas 2: EPUB modifié, DB non → EPUB gagne
- [ ] Cas 3: DB modifiée, EPUB non → writeback
- [ ] Cas 4: conflit (EPUB et DB modifiés) → EPUB gagne
