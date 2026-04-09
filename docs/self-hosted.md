# Déploiement self-hosted (Docker)

Guide opérateur : premier lancement, mises à jour, sauvegardes et paramètres de sécurité. La référence des variables est [docs/SPECS.md](./SPECS.md) §13 ; le modèle de menace et les garanties applicatives sont décrits en §14.

## Prérequis

- Docker et Docker Compose
- Fichier d’environnement ou variables définies pour l’instance (voir [`.env.example`](../.env.example))

En **production**, l’application exige notamment `DATABASE_URL`, `NEXTAUTH_URL` et `NEXTAUTH_SECRET` (minimum 32 caractères). En cas d’erreur, le message au démarrage liste les règles non respectées.

## Fichier Compose de référence

Le déploiement documenté ici correspond au fichier versionné **[docker/docker-compose.yml](../docker/docker-compose.yml)** (services `shelf`, `db`, `redis`, volumes nommés, ports). L’extrait YAML en SPECS §13.2 est un schéma simplifié : en cas de divergence, **faire foi du fichier du dépôt**.

## Démarrer avec Compose

Depuis la racine du dépôt :

```bash
docker compose -f docker/docker-compose.yml up --build
```

L’image applique automatiquement les migrations Prisma (`prisma migrate deploy`) avant `next start`.

### Variables d’environnement critiques

| Domaine | Variables (résumé) |
|--------|---------------------|
| Base | `DATABASE_URL` |
| Auth | `NEXTAUTH_URL`, `NEXTAUTH_SECRET` (≥ 32 caractères en prod) |
| OIDC (optionnel) | `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` — les trois, ou aucune |
| Stockage local | `STORAGE_TYPE=local`, `STORAGE_PATH` |
| Stockage S3 | `STORAGE_TYPE=s3` + `S3_*` (voir §13.1) |
| Rate limiting partagé | `REDIS_URL` recommandé si plusieurs réplicas |
| Inscription | `REGISTRATION_ENABLED` |
| Cron reco (optionnel) | `SHELF_CRON_SECRET` pour sécuriser `/api/cron/recommendations` |

Liste complète et valeurs par défaut : §13.1.

### Volumes

- `library_data` : fichiers EPUB et stockage local sous `STORAGE_PATH` (par défaut `/data/library` dans le conteneur)
- `shelf_covers` : monté sur `/data/library/covers` (couvertures)
- `pg_data` : données PostgreSQL
- `redis_data` : persistance Redis (si utilisé)

### Redis

Le service `redis` est optionnel dans Compose ; sans `REDIS_URL`, le rate limiting retombe sur un stockage **mémoire** par processus (inadapté au **scale horizontal** : compteurs non partagés entre instances).

## Mise à jour (upgrades)

1. Sauvegarder la base et les volumes fichiers (voir section suivante).
2. Récupérer la nouvelle révision (`git pull` ou image tag).
3. Reconstruire et redémarrer en respectant la dépendance **PostgreSQL healthy** avant `shelf` :

   ```bash
   docker compose -f docker/docker-compose.yml up --build -d
   ```

4. Les migrations s’exécutent à l’entrée du conteneur `shelf` ; si vous déployez **sans** cet entrypoint, lancer manuellement `pnpm exec prisma migrate deploy` avec le bon `DATABASE_URL`.
5. Vérifier les **nouvelles variables** éventuelles dans §13.1 / `.env.example` après chaque montée de version.

## Sauvegardes et restauration

- **PostgreSQL** : utiliser `pg_dump` (format custom ou SQL) depuis un client ayant accès à `db` (ex. `docker compose exec db pg_dump -U shelf shelf > backup.sql`). Restauration : `psql` ou `pg_restore` selon le format.
- **Fichiers bibliothèque** : sauvegarder le contenu de `STORAGE_PATH` (volumes `library_data` et `shelf_covers`), qui contient EPUB, couvertures et objets gérés par l’adapter local.
- Les blobs **ne sont pas exposés** par URL publique directe : l’accès passe par l’app authentifiée (§14). Les sauvegardes restent **confidentielles** au même titre que la base.

## Sécurité opérationnelle

### Rotation des secrets

| Secret | Effet typique |
|--------|----------------|
| `NEXTAUTH_SECRET` | Invalidation des sessions JWT existantes ; tous les utilisateurs devront se reconnecter. |
| `COVER_TOKEN_SECRET` (si défini) | Les jetons HMAC des URLs de couverture deviennent invalides jusqu’à régénération côté app. Si absent, la rotation de `NEXTAUTH_SECRET` joue un rôle équivalent pour ce mécanisme. |
| `SHELF_CRON_SECRET` | Les appels planifiés vers `/api/cron/recommendations` doivent utiliser le nouveau secret. |
| Clés `S3_ACCESS_KEY` / `S3_SECRET_KEY` | Mettre à jour les credentials côté fournisseur S3/MinIO et redéployer ; pas d’impact sur les chemins objets s’ils restent inchangés. |

Générer des valeurs fortes (ex. `openssl rand -hex 32`).

### OIDC

Configurer **les trois** variables `OIDC_*` ou **aucune** : un état partiel doit être évité (voir §13.1). Après changement d’issuer ou de client, vérifier la redirection et les URLs autorisées côté fournisseur d’identité.

### CORS

Les en-têtes CORS sur les routes API concernées n’autorisent que l’**origine** dérivée de `NEXTAUTH_URL` : toute incohérence entre l’URL publique du site et `NEXTAUTH_URL` peut bloquer les appels cross-origin authentifiés.

### Rate limiting (valeurs courantes)

Fenêtre par défaut : **60 secondes** pour les compteurs ci-dessous (sauf mention). D’autres routes ou Server Actions ont leurs propres plafonds ; pour la liste exhaustive, chercher `rateLimitOrThrow` et `rateLimit` dans le dépôt.

| Zone | Limite indicative |
|------|-------------------|
| Connexion (login) | 10 requêtes / minute / IP |
| Inscription (register) | 5 / minute / IP |
| Upload EPUB (admin) | 10 / minute / admin + IP |
| Création livre physique (admin) | 20 / minute / admin + IP |
| Aperçu / recherche Open Library via `POST /api/books` (JSON admin) | 30 / minute chaque variante / admin + IP |
| Serveur MCP (`/api/mcp`) | 60 requêtes / minute / clé API |

Avec **plusieurs instances** `shelf`, définir `REDIS_URL` pour que ces compteurs soient cohérents.

## Stockage : local vs S3 / MinIO

| Mode | Variables | Usage |
|------|-----------|--------|
| Local | `STORAGE_TYPE=local`, `STORAGE_PATH` | Disque du serveur ou volume Docker (défaut Compose). |
| S3-compatible | `STORAGE_TYPE=s3`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION` | Cloud S3, MinIO, etc. |

L’application **ne sert pas** les fichiers depuis l’URL du bucket : lecture via endpoints authentifiés uniquement (§14).

### Changement de backend de stockage

Il n’existe pas d’outil de migration automatique intégré : procédure **manuelle** recommandée :

1. **Arrêter** l’application pour éviter les écritures concurrentes.
2. Copier tous les objets vers le backend cible en conservant les **chemins logiques** attendus par l’app (en base, `BookFile.storage_path` doit rester cohérent avec les clés/objets du stockage cible).
3. Mettre à jour les variables (`STORAGE_TYPE`, `STORAGE_PATH` ou `S3_*`), redémarrer.
4. Smoke test : ouverture d’un livre existant, upload neuf, couverture.

En cas de doute sur la convention de chemins, inspecter le schéma Prisma (`BookFile.storage_path`) et les modules sous `src/lib/storage/`.

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
