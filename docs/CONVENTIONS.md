# Conventions projet

## Structure

- **Routes/pages** : `src/app/**` (Next.js App Router)
- **UI** : `src/components/**`
- **Logique métier / IO** : `src/lib/**`
- **Hooks client** : `src/hooks/**`
- **Types partagés** : `src/types/**`

## Règles de dépendances (import)

- `src/components/**` peut importer `src/lib/**`, mais ne doit pas accéder directement à la DB ou au storage (via un client “global” ou des accès non contrôlés).
  Les accès DB/IO doivent passer par des fonctions dédiées (dans `src/lib/**`) et, quand ce sera en place, par des endpoints/Server Actions.
- `src/lib/**` ne dépend pas de composants UI.

## Conventions de code

- TypeScript strict (par défaut) et imports via alias `@/*`.
- Pas d’endpoints/outils inventés : la source de vérité est `docs/SPECS.md`.
- Tout ce qui touche à **auth/upload/storage/reader/MCP** est **security-critical** : validations côté serveur, checks d’accès, pas de fuite de fichiers.
