# Observabilité et SLO internes (Shelf)

## Sources de vérité

- **Logs** : une ligne JSON par événement (`logShelfEvent`), agrégation via stack Docker / hébergeur (Vercel, etc.). Ne jamais indexer les requêtes texte utilisateur brutes (SPECS §13.3).
- **Base** : `admin_import_jobs` (file et backlog), `AdminAuditLog` (actions admin sensibles).
- **API** : `GET /api/admin/ops-summary` pour une vue instantanée (compteurs + circuit breakers **process-local**).

## SLO indicatifs (internes)

| Indicateur                | Objectif                                         | Signal                                                                         |
| ------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| Disponibilité API app     | 99 % mensuel (hors maintenance)                  | taux 5xx sur routes critiques                                                  |
| Latence catalogue externe | P95 conforme SPECS §15                           | `openlibrary_request.durationMs`, k6 (workflow loadtest si secrets configurés) |
| Backlog jobs              | Pas de croissance continue sur 24 h              | `ops-summary`, alertes manuelles                                               |
| Cron recommendations      | Au moins 1 exécution réussie / fenêtre planifiée | logs cron, `jobCreated` / `jobId`                                              |

Les seuils numériques sont **internes** ; les ajuster après mesure réelle.

## Alerting actionnable

1. **Taux d’erreur catalog** : pic de `502` sur `/api/catalog/search` → runbook `external-catalog-down.md`.
2. **`external_circuit_open`** répété → idem ; vérifier quota / disponibilité provider.
3. **Jobs `dead_letter`** → runbook `job-backlog.md`.
4. **Latence DB** : temps de requêtes Prisma anormal → `EXPLAIN`, index, charge (hors scope détaillé ici).

## Limites

- Circuit breakers **par processus** : en multi-instance, l’alerte peut ne refléter qu’une partie du trafic.
- Les SLO « deux cycles de release » (roadmap Phase 32.4) supposent collecte d’historique sur au moins deux releases.
