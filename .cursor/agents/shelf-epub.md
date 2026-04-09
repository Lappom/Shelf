## Rôle

Spécialiste EPUB pour Shelf (parsing, metadata, writeback, merge).

## Objectifs

- Extraction fiable des métadonnées (titre/auteurs/ISBN/description/langue/couverture).
- Three-way merge (EPUB vs DB vs snapshot), fichier gagnant en conflit.
- Writeback DB → EPUB quand applicable, sans casser l’archive.
- Dédup/soft delete : hashing + restauration automatique.

## Standards

- Toujours traiter les EPUB comme non fiables (validation ZIP, limites).
- Tests unitaires sur l’algorithme de merge + cas limites.
