# Runbook — Backlog jobs (`admin_import_jobs`)

## Symptômes

- Jobs `pull_books` ou `recommendations_recompute` restent en `queued` / `running` anormalement longtemps.
- Compteurs `failed` ou `dead_letter` qui augmentent.
- UI admin **Ops** (`/admin/ops`) ou `GET /api/admin/ops-summary` montre un déséquilibre des statuts.

## Diagnostic

1. Lister les jobs récents : `GET /api/admin/pull-books/jobs` (pull-books uniquement) ou requête SQL / Prisma sur `admin_import_jobs` par `type` et `status`.
2. Vérifier `last_error`, `attempts`, `max_attempts`, `next_run_at`.
3. Pour pull-books : vérifier disponibilité Open Library (runbook `external-catalog-down.md`).
4. Pour recommendations : vérifier charge DB et temps de `recompute` ; le cron ne traite qu’un **nombre limité de chunks** par appel (`maxChunks`) — augmenter la fréquence du cron ou `maxChunks` si la file utilisateur est grande.

## Remédiation

- **Annulation** : `POST /api/admin/pull-books/jobs/:id/cancel` (jobs pull-books `queued|running`).
- **Retry** : `POST /api/admin/pull-books/jobs/:id/retry` pour statuts terminaux éligibles.
- Jobs `recommendations_recompute` : pas d’API dédiée cancel/retry dans cette version — mise à jour manuelle en base réservée aux opérateurs (annulation = `cancel_requested_at` ou statut, selon politique interne).

## Prévention

- Surveiller `ops-summary` après chaque déploiement.
- Ne pas laisser plusieurs workers concurrents non coordonnés sur la même base sans verrouillage (le modèle actuel utilise des verrous ligne + lock owner).
