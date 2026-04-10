# Check-list release V2

## Avant merge / déploiement

- [ ] `pnpm lint` et `pnpm typecheck` verts.
- [ ] Migrations Prisma revues ; nom explicite ; **rollback** : conserver le SQL down manuel ou plan de rétro compatible (restauration snapshot DB si nécessaire).
- [ ] Variables d’environnement nouvelles documentées dans SPECS §13 et provisionnées sur l’environnement cible.
- [ ] Secrets (`SHELF_CRON_SECRET`, clés storage, etc.) non commités ; rotation si exposition suspecte.

## Après déploiement

- [ ] Smoke : login, ouverture reader, recherche bibliothèque, `GET /api/catalog/search` (utilisateur authentifié).
- [ ] Admin : `/admin/ops` — pas d’anomalie évidente sur les compteurs de jobs.
- [ ] Cron : déclencher ou attendre `/api/cron/recommendations` ; vérifier réponse `jobId` et progression des jobs `recommendations_recompute` si besoin.

## Communication

- [ ] Noter la fenêtre de maintenance si applicable.
- [ ] Informer les admins des changements visibles (UI, API, comportement cron).

## Post-release review (template court)

- **Date / version** :
- **Incidents** : (aucun / résumé + lien runbook)
- **Métriques vs SLO** : (logs, ops-summary, k6 si exécuté)
- **Dette / suivis** : tickets ou items roadmap restants

## Gate Phase 32.4 (roadmap)

Les critères « catalogue externe finalisé », « recommandations hybrides + UX », « MCP V2 gouvernance », « SLO sur 2 releases » sont **produit global** : les cocher dans `roadmap.md` uniquement lorsque ces chantiers sont effectivement livrés et validés.
