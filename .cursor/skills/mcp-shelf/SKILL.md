---
name: mcp-shelf
description: Implémente et maintient le serveur MCP de Shelf (endpoint /api/mcp), la gestion des API keys, et le design des tools/resources/prompts. À utiliser quand l'utilisateur mentionne MCP, Model Context Protocol, tools, resources, prompts, ou intégration IA.
---

# MCP Shelf

## Implémentation (default)

- Endpoint : `/api/mcp` (SSE ou Streamable HTTP).
- Auth : header `Authorization: Bearer sk_shelf_...`.
- Stockage API key : ne jamais stocker en clair ; stocker `key_hash = SHA-256(token)`.
- Rate limit : 60 req/min par key (configurable).
- Multi-user : chaque tool doit filtrer par `user_id` (ownership) + role.

## Design des tools

- Inputs validés (zod) et erreurs structurées.
- Limiter les payloads (chapitre/texte) avec `maxChars`/`limit`.
- Éviter les outputs “gigantesques” : paginer `list_books`, `get_all_annotations`, etc.

## Checklist sécurité

- [ ] Aucun secret / token logué.
- [ ] Tools admin protégés.
- [ ] Isolation multi-user testée.
