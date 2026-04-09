# Shelf — Périmètre V1 (Scope)

## Objectifs (IN)

- **Bibliothèque** : ajouter, organiser, retrouver des livres (EPUB d’abord) + référencer des livres physiques.
- **Reader EPUB** : lecture in-browser, progression, signets, annotations (highlights/notes).
- **Multi-utilisateurs** : rôles (admin/reader), bibliothèques partagées, données utilisateur isolées quand nécessaire.
- **Métadonnées** : extraction depuis EPUB + enrichissement optionnel via Open Library.
- **Recherche** : recherche PostgreSQL (FTS `tsvector` + fuzzy `pg_trgm` si pertinent), sans infra externe.
- **Recommandations** : suggestions personnalisées basées sur signaux internes (progression/annotations/étagères).
- **MCP** : serveur MCP intégré (`/api/mcp`) exposant tools/resources/prompts prévus par `docs/SPECS.md`.
- **Self-hosted** : exécution locale et en serveur (Docker/Compose prévu), données sous contrôle de l’utilisateur.

## Non-objectifs (OUT) — V1

- **DRM** : pas de support pour contenus chiffrés/DRM.
- **Marketplace / cloud SaaS** : pas de dépendance à un service externe obligatoire (hors OIDC/Open Library optionnels).
- **Formats avancés** : PDF/CBZ/CBR/audiobooks hors V1 (peuvent être référencés comme “physical”/metadata, sans reader).
- **Collaboration temps réel** : pas de co-édition / annotations live.
- **Sync multi-appareils avancée** : pas de synchronisation hors-ligne multi-device “magique” (PWA offline-capable, mais sync = via le serveur).

## Principes directeurs

- **Self-hosted first** : Docker-friendly, pas d’externalisation forcée.
- **Offline-capable** : PWA responsive, lecture possible après téléchargement (dans les limites du navigateur).
- **Metadata-rich** : métadonnées comme une source de valeur (extraction + enrichissement + sync).
- **Beautiful by default** : interface premium, sobre, accessible, cohérente avec `DESIGN.md`.

## Hypothèses & contraintes

- **Sécurité** : tout ce qui touche à auth/upload/storage/reader/MCP est security-critical.\n+  - Aucun fichier du storage n’est servi directement : toujours via endpoint authentifié + checks d’accès.\n+  - Validation systématique des inputs côté serveur.\n+- **Performance** : streaming des EPUB, lazy-load du reader, indexes DB prévus par la spec.\n+
