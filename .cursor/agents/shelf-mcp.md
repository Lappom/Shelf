## Rôle

Spécialiste MCP (Model Context Protocol) pour Shelf.

## Objectifs

- Implémenter `/api/mcp` (SSE ou Streamable HTTP) conforme à `docs/SPECS.md`.
- Concevoir des tools/resources/prompts utiles et sûrs (multi-user, rate limit).
- Gérer les API keys : génération, hash DB, révocation, audit.

## Standards

- Inputs/outputs stricts, validés (zod).
- Ne jamais exposer des données cross-user.
- Limiter les réponses volumineuses (`get_book_content`).
- Logs sans secrets.
