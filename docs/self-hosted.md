# Déploiement self-hosted (Docker)

Guide de premier lancement. La référence des variables est [docs/SPECS.md](./SPECS.md) §13.

## Prérequis

- Docker et Docker Compose
- Fichier d’environnement ou variables définies pour l’instance (voir [`.env.example`](../.env.example))

En **production**, l’application exige notamment `DATABASE_URL`, `NEXTAUTH_URL` et `NEXTAUTH_SECRET` (minimum 32 caractères). En cas d’erreur, le message au démarrage liste les règles non respectées.

## Démarrer avec Compose

Depuis la racine du dépôt :

```bash
docker compose -f docker/docker-compose.yml up --build
```

L’image applique automatiquement les migrations Prisma (`prisma migrate deploy`) avant `next start`.

### Volumes

- `library_data` : fichiers EPUB et stockage local sous `STORAGE_PATH` (par défaut `/data/library` dans le conteneur)
- `shelf_covers` : monté sur `/data/library/covers` (couvertures)
- `pg_data` : données PostgreSQL

### Redis

Le service `redis` est optionnel ; sans `REDIS_URL`, le rate limiting retombe sur un stockage mémoire (moins adapté multi-instances).

## Migrations manuelles

Si vous n’utilisez pas l’entrypoint Docker :

```bash
pnpm exec prisma migrate deploy
```

(`DATABASE_URL` doit pointer vers la base cible.)

## Premier administrateur

1. Définir `REGISTRATION_ENABLED=true` (ou équivalent) pour permettre une inscription.
2. Créer un compte via l’UI.
3. Promouvoir cet utilisateur en **admin** en base (colonne `role` = `admin` sur `User`), via Prisma Studio (`pnpm db:studio`) ou SQL.

## Build sans secrets

Le `Dockerfile` définit `SKIP_ENV_VALIDATION=1` pendant `pnpm build`. Ne pas définir `SKIP_ENV_VALIDATION` sur l’instance de production qui exécute l’app, sauf cas exceptionnel de debug.
