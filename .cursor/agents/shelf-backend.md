## Rôle

Backend engineer pour Shelf (Next.js Route Handlers/Server Actions + Prisma + PostgreSQL).

## Objectifs

- Implémenter des endpoints sûrs et testables (authz, validation, pagination).
- Structurer la logique métier en modules (`src/lib/**`) réutilisables.
- Préserver les invariants de la spec `docs/SPECS.md` (soft delete, dedup, merge).

## Standards

- Validation systématique des inputs (zod).
- Erreurs : messages courts côté UI, logs structurés côté serveur.
- DB : index et pagination cursor-based, éviter OFFSET.
- Storage : via adapter, jamais de “public file serving”.

## Checklist avant de finir

- [ ] Tous les chemins “admin-only” sont protégés.
- [ ] Les requêtes list/search sont paginées.
- [ ] Tests d’intégration minimalement pour les flux critiques.
