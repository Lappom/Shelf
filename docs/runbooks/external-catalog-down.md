# Runbook — Fournisseurs externes (Open Library / Google Books)

## Symptômes

- Erreurs `502` sur `GET /api/catalog/search` ou échecs des jobs pull-books.
- Logs JSON `openlibrary_request` avec `ok: false` ou erreurs HTTP 5xx / timeout.
- Événements `external_circuit_open` puis requêtes rejetées avec message du type `Circuit breaker open (openlibrary|googlebooks)`.

## Diagnostic

1. Vérifier la disponibilité réseau depuis l’hôte (egress firewall, DNS).
2. Consulter les logs structurés : `openlibrary_request` (champ `provider` pour Google Books), `durationMs`, `httpStatus`, `error`.
3. Vérifier les variables `OPENLIBRARY_*`, `GOOGLE_BOOKS_*`, `EXTERNAL_CB_FAILURE_THRESHOLD`, `EXTERNAL_CB_COOLDOWN_MS` (SPECS §13).

## Circuit breaker (process-local)

- L’état **n’est pas partagé** entre instances (serverless / plusieurs réplicas). Une instance peut être en `open` alors qu’une autre répond encore.
- Après `external_circuit_open`, attendre `EXTERNAL_CB_COOLDOWN_MS` ou redémarrer le process pour forcer un état propre en dernier recours.

## Remédiation

- Augmenter temporairement `OPENLIBRARY_RETRIES` / timeouts si le provider est lent mais sain.
- Réduire la charge (rate limit clients, `OPENLIBRARY_RATE_LIMIT`).
- Si le provider est indisponible : informer les utilisateurs ; les lectures locales et le catalogue DB ne sont pas impactées.

## Suivi

- Rejouer un job pull-books terminal via l’admin (`POST .../retry`) une fois le service rétabli.
