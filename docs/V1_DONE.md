# Shelf — Definition of Done (V1)

Ce document définit les critères “done” pour considérer la V1 livrable (à compléter au fil des phases).

## Auth & rôles

- [ ] Inscription/login (credentials) fonctionnels, OIDC optionnel configurable.
- [ ] Sessions sécurisées (cookies httpOnly) et CSRF conforme aux patterns retenus.
- [ ] RBAC appliqué (admin-only pour actions sensibles).
- [ ] Erreurs utilisateur claires (403/401/validation).

## Upload & ingestion

- [ ] Upload EPUB (taille max configurable) avec validation MIME + ZIP EPUB valide.
- [ ] Déduplication de base via hash.
- [ ] Extraction métadonnées EPUB (titre/auteurs/langue/cover si dispo).

## Storage (security-critical)

- [ ] Storage adapter (local + S3/MinIO) fonctionnel.
- [ ] **Aucun accès direct** aux fichiers storage (pas de liens publics).
- [ ] Streaming download/reader via endpoint authentifié + checks d’accès.

## Reader

- [ ] Reader EPUB intégré (lazy-load), lecture stable sur desktop/mobile.
- [ ] Progression persistée (0..1 + CFI).
- [ ] Annotations (highlight/note/bookmark) persistées.
- [ ] Contenu rendu **sanitisé** (anti-XSS).

## Bibliothèque & étagères

- [ ] Library list paginée, tri et filtres basiques.
- [ ] Détail livre (métadonnées, actions selon rôle).
- [ ] Étagères système (favoris + en cours) et étagères manuelles.

## Recherche

- [ ] Endpoint/search UI avec FTS Postgres (`tsvector`) + ranking.
- [ ] Option fuzzy via `pg_trgm` si activé et utile.
- [ ] Recherche paginée (cursor-based si appliqué).

## Métadonnées & enrichissement

- [ ] Enrichissement Open Library optionnel et rate-limited.
- [ ] Stratégie de merge (three-way) définie et testée.
- [ ] Traçabilité de la source (`metadata_source`).

## Recommandations

- [ ] Calcul et stockage des scores (table `UserRecommendation`).
- [ ] UX : section “Pour vous”, raisons affichées, dismiss.
- [ ] Respect de la vie privée (désactivation collaborative filtering).

## MCP (security-critical)

- [ ] `/api/mcp` protégé par API keys utilisateur.
- [ ] Rate limiting par API key, audit logs minimaux.
- [ ] Tools/resources/prompts conformes à `docs/SPECS.md` (pas d’invention).

## Qualité / DX

- [ ] Lint/format CI-ready (scripts reproductibles).
- [ ] Tests unitaires + intégration sur la logique critique (auth/upload/storage/merge/MCP).
- [ ] Build prod OK, pas d’erreurs TypeScript.
- [ ] Documentation de setup (README) et variables d’environnement.
