# /fix — Vérifications qualité (local, merge-ready)

Quand l’utilisateur invoque `/fix`, exécuter **depuis la racine du dépôt** la chaîne ci-dessous dans **un seul** terminal (fail-fast via `&&`).

## Package manager

Utiliser **pnpm** (aligné sur `.github/workflows/ci-quality.yml` et `pnpm-lock.yaml`). Si `pnpm` est indisponible, fallback : `npm run` avec les mêmes noms de scripts.

## Ordre des scripts

1. `format:fix` — applique Prettier avant le lint pour éviter des faux positifs / allers-retours.
2. `lint` — ESLint.
3. `typecheck` — `tsc --noEmit`.
4. `build` — `next build` (le plus coûteux côté compile).
5. `test` — `vitest run`.

## Commande unique

```bash
pnpm run format:fix && pnpm run lint && pnpm run typecheck && pnpm run build && pnpm run test
```

## Environnement

Si `build` ou `test` échouent faute de config, vérifier les variables d’environnement attendues (ex. `DATABASE_URL` selon le setup local / `.env`).

## Boucle de correction

Si une étape échoue : diagnostiquer, corriger le minimum nécessaire, puis **relancer toute la chaîne** depuis le début jusqu’à succès complet.
