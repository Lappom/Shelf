# Recommandations — évaluation et funnel (V2)

Ce document décrit comment mesurer la qualité des suggestions à partir des tables `recommendation_analytics_events` et `user_recommendation_feedback`, sans service externe.

## Définitions

- **Impression** : une ligne `event = 'impression'` (source `carousel` ou `page`) pour un `(user_id, book_id)` au moment où la carte apparaît dans la liste chargée.
- **Clic** : `event = 'click'` (lien fiche livre depuis une surface reco, ou équivalent).
- **CTR (approximatif)** : `count(clic distinct user+book) / count(impression distinct user+book)` sur une fenêtre temporelle ; en pratique dédupliquer par jour si besoin pour limiter le bruit.
- **Dismiss qualifié** : `dismiss` avec contexte (utilisateur a vu la raison + actions **J’aime** / **Moins** disponibles). Le taux de dismiss « non qualifié » peut être approché par la part de dismiss sans clic ni feedback sur la même suggestion (requête plus avancée).
- **Feedback explicite** : lignes dans `user_recommendation_feedback` et événements `like` / `dislike`.

## Exemples SQL (PostgreSQL)

Impressions et clics sur 7 jours :

```sql
SELECT date_trunc('day', created_at) AS d,
       event,
       COUNT(*) AS n
FROM recommendation_analytics_events
WHERE created_at >= now() - interval '7 days'
GROUP BY 1, 2
ORDER BY 1, 2;
```

CTR agrégé (global) :

```sql
WITH imp AS (
  SELECT COUNT(*)::float AS n FROM recommendation_analytics_events
  WHERE event = 'impression' AND created_at >= now() - interval '30 days'
),
clk AS (
  SELECT COUNT(*)::float AS n FROM recommendation_analytics_events
  WHERE event = 'click' AND created_at >= now() - interval '30 days'
)
SELECT clk.n / NULLIF(imp.n, 0) AS ctr_global
FROM imp, clk;
```

## A/B ou avant/après

- **Périodes** : comparer les métriques sur deux fenêtres avant/après déploiement (même durée, même jour de la semaine si possible).
- **Flag optionnel** : une variable d’environnement ou un champ utilisateur peut router vers une variante d’algo ; non requis pour une première mesure.
- **Offline** : exporter un extrait des événements + scores `user_recommendations` pour corréler CTR avec `reasons` JSON (code `read_together`, `neighbor_user`, etc.).

## Baseline V1 vs V2

La V1 correspond au blend sans co-occurrence ni ajustements langue/fichier/ancres ; la V2 est le code actuel dans `src/lib/recommendations/`. Documenter dans les notes de release la date de bascule pour les comparaisons temporelles.
