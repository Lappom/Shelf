# Runbook — Métadonnées incohérentes / corruption perçue

## Symptômes

- Champs livre incohérents entre EPUB, base et snapshot.
- Conflits signalés dans l’UI de merge métadonnées.

## Diagnostic

1. Ouvrir l’UI admin **merge métadonnées** pour le livre : `/admin/books/:id/metadata-merge`.
2. Consulter `GET /api/admin/metadata-merge-audits` et `GET /api/admin/audit-logs` pour l’historique (`metadata_merge_preview`, `metadata_merge_commit`).
3. Vérifier `BookMetadataSnapshot` et `content_hash` si un réingestion a eu lieu.

## Remédiation

- Utiliser le flux **preview → commit** documenté dans SPECS (décisions par champ, audit obligatoire au commit).
- En cas d’EPUB source de vérité : réingestion contrôlée après sauvegarde ; ne pas modifier la base à la main sans trace.

## Escalade

- Si soupçon de corruption fichier storage : isoler le `BookFile`, ne pas servir le fichier sans contrôle d’accès ; vérifier intégrité ZIP / EPUB selon les règles d’upload (SPECS §14).
