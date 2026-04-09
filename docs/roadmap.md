# Roadmap Shelf (V1) — ultra détaillée

> Objectif : couvrir **100%** de `docs/SPECS.md` via des phases et sous-phases actionnables.  
> Format : checklist `- [ ]` (à cocher au fil de l’implémentation).

---

## Phase 0 — Cadrage, repo, DX (fondations)

### 0.1 Vision & périmètre produit (docs/SPECS.md §1)
- [x] Formaliser le périmètre V1 (gestion bibliothèque + reader + multi-users + recommandations + MCP).
- [x] Énoncer explicitement les principes : self-hosted first, offline-capable, metadata-rich, beautiful by default.
- [x] Définir “done” V1 (critères de complétude par domaine : upload, recherche, reader, admin, etc.).

### 0.2 Stack & conventions techniques (docs/SPECS.md §2)
- [x] Initialiser Next.js 16+ App Router (structure `src/app`, `src/components`, `src/lib`).
- [x] Mettre en place Tailwind CSS 4 + shadcn/ui (tokens cohérents avec `DESIGN.md`).
- [x] Choisir state client (Zustand ou Context) et documenter l’usage (reader + préférences).
- [x] Mettre Prisma + PostgreSQL 16 (migrations, client, patterns de requêtes).
- [x] Mettre Auth.js v5 (NextAuth.js) (credentials + OIDC configurable).
- [x] Mettre l’abstraction storage adapter (local + S3/MinIO).
- [x] Mettre l’EPUB reader (epub.js ou Foliate.js) et isoler le bundle (lazy import).
- [x] Prévoir recherche PostgreSQL (tsvector + pg_trgm) sans infra externe.
- [x] Prévoir Redis optionnel (sessions + cache OpenLibrary).
- [x] Préparer Docker + Compose + CI GitHub Actions (lint/tests/build).

### 0.3 Arborescence projet (docs/SPECS.md §2)
- [x] Créer/aligner l’arborescence cible (routes App Router, `lib/db`, `lib/storage`, `lib/epub`, `lib/metadata`, `lib/auth`).
- [x] Définir conventions de nommage et limites de responsabilité par dossier (UI vs lib).

---

## Phase 1 — Données & base (modèle, migrations, indexes)

### 1.1 Modèle relationnel (docs/SPECS.md §3.1)
- [x] Implémenter les relations : User ↔ progress/annotations/preferences/shelves/recommendations/apiKeys.
- [x] Implémenter Book ↔ progress/annotations/bookFiles/shelves/tags/snapshot.

### 1.2 Prisma schema (docs/SPECS.md §3.2)
- [x] Table `User` (rôle admin/reader, soft delete, champs OIDC).
- [x] Table `Book` (métadonnées, `format`, `content_hash`, `open_library_id`, `metadata_source`, `added_by`, soft delete, `search_vector`).
- [x] Table `BookFile` (chemin storage, taille, mime, hash).
- [x] Table `BookMetadataSnapshot` (epub_metadata + db_metadata + synced_at).
- [x] Table `Shelf` (type manual/dynamic/favorites/reading, owner, public, icon, sort_order).
- [x] Table `ShelfRule` (rules JSONB).
- [x] Pivot `BookShelf` (added_at, sort_order).
- [x] Table `Tag` (name unique, color).
- [x] Pivot `BookTag`.
- [x] Table `UserBookProgress` (status, progress 0..1, current_cfi, timestamps, contrainte unique user+book).
- [x] Table `UserAnnotation` (highlight/note/bookmark, cfi_range, color, note, timestamps).
- [x] Table `UserPreference` (theme + reader prefs + library prefs, unique user).
- [x] Table `UserRecommendation` (score, reasons JSONB, seen/dismissed, computed_at, unique user+book).
- [x] Table `ApiKey` (hash, prefix, last_used, expires, revoked, timestamps).

### 1.3 Indexes & contraintes (docs/SPECS.md §15 + §3)
- [x] Index GIN sur `Book.search_vector`.
- [x] Activer/installer extension `pg_trgm` et index trigram nécessaires (titre/auteurs si requis).
- [x] Index unique/lookup : `Book.content_hash`, `Book.isbn_13`, `UserBookProgress(user_id, book_id)`, `UserRecommendation(user_id, book_id)`, etc.
- [x] Vérifier contraintes de soft delete (unicité conditionnelle si nécessaire).

### 1.4 Données de départ
- [x] Stratégie “premier utilisateur = admin”.
- [x] Création automatique des étagères système par utilisateur (favoris + en cours).

---

## Phase 2 — Authentification & autorisation (security-critical)

### 2.1 Auth local (docs/SPECS.md §4.1)
- [x] Implémenter inscription email + mot de passe (min 8 chars) avec hash bcrypt.
- [x] Implémenter login credentials.
- [x] Gestion `password_hash` nullable pour users OIDC.
- [x] Appliquer “premier user inscrit → admin”.

### 2.2 OIDC configurable (docs/SPECS.md §4.1 + §13)
- [x] Support OIDC via variables d’environnement (`OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`).
- [x] Mapper `oidc_provider` + `oidc_sub` en DB.
- [x] UI login : bouton OIDC si configuré.

### 2.3 Sessions (docs/SPECS.md §4.3)
- [x] JWT en cookie httpOnly.
- [x] Durée session 30 jours configurable.
- [x] Refresh silencieux.

### 2.4 Autorisation par rôle (docs/SPECS.md §4.2)
- [x] Guard “admin-only” pour upload/édition/suppression/import/scan doublons/tags globaux/enrichissement.
- [x] Guard “reader” : lecture + annotations + étagères perso + recommandations + API keys MCP.

### 2.5 Protection endpoints (docs/SPECS.md §14)
- [x] CSRF (selon patterns Auth.js + routes mutables).
- [x] Rate limiting auth (login/register) + upload + MCP.
- [x] CORS restrictif (origine app uniquement).

---

## Phase 3 — Storage adapter & fichiers (security-critical)

### 3.1 Interface StorageAdapter (docs/SPECS.md §10.1)
- [x] Implémenter l’interface : upload/download/delete/exists/getUrl/getSize.
- [x] Définir stratégie d’erreurs (fichier manquant, permissions, timeouts).

### 3.2 Implémentation Local Storage (docs/SPECS.md §10.2)
- [x] `STORAGE_PATH` (défaut `/data/library`).
- [x] Convention de structure chemins : `/{format}/{author}/{filename}`.
- [x] Convention covers : `/covers/{book_id}.{ext}`.

### 3.3 Implémentation S3/MinIO (docs/SPECS.md §10.3)
- [x] Support env `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`.
- [x] Chemins identiques au local.
- [ ] Presigned URLs (si nécessaire) mais **sans servir de fichier directement** : toujours via endpoint authentifié.

### 3.4 Endpoints de delivery fichiers (docs/SPECS.md §12.1 + §14)
- [x] Endpoint authentifié de streaming/download EPUB pour reader.
- [x] Vérifications d’accès (user connecté + autorisation + existence du book/file).
- [x] Interdire toute exposition directe du storage (pas de “public bucket direct link”).

---

## Phase 4 — Ingestion EPUB (upload), extraction, création Book/BookFile

### 4.1 Upload EPUB (docs/SPECS.md §5.1 + §14)
- [x] UI upload réservé admin (FAB sur Library).
- [x] Validation : MIME + taille max (défaut 100MB) + ZIP/EPUB valide.
- [x] Calcul SHA-256 (`content_hash`) côté serveur.

### 4.2 Soft-delete restore / dédup (docs/SPECS.md §5.1 + §5.4)
- [x] Si soft-deleted book match (hash ou filename) → restaurer au lieu de recréer.
- [x] Si book actif même hash → rejeter upload + fournir lien vers existant.

### 4.3 Stockage du fichier (docs/SPECS.md §5.1 + §10)
- [x] Upload vers StorageAdapter (persist `storage_path`, `file_size`, `mime_type`, hash dans `BookFile`).

### 4.4 Extraction métadonnées EPUB (docs/SPECS.md §5.1 + §9)
- [x] Extraire : titre, auteurs, ISBN, description, couverture, langue.
- [x] Gérer cas incomplets (valeurs manquantes, encodage, champs multiples).
- [x] Stocker la couverture (fichier local/S3) et `Book.cover_url` en path relatif/URL.

### 4.5 Création snapshot initial (docs/SPECS.md §5.1 + §3.2)
- [x] Créer `BookMetadataSnapshot.epub_metadata` au moment de l’ingestion.

### 4.6 Enrichissement Open Library à l’ingestion (docs/SPECS.md §5.1 + §9)
- [x] Si ISBN trouvé : call Open Library, compléter description/sujets/pages/cover HR.
- [x] Fusion : EPUB prioritaire, OpenLibrary en complément.
- [x] `metadata_source` cohérent (epub/openlibrary/manual).

### 4.7 Search vector (docs/SPECS.md §5.1 + §7.1)
- [x] Calculer `search_vector` depuis titre/auteurs/description/sujets.

---

## Phase 5 — Livres physiques & couvertures

### 5.1 Création livre physique (docs/SPECS.md §5.2)
- [x] Form admin : titre, auteurs, ISBN, etc.
- [x] `format = physical`, pas de `BookFile`, `content_hash` null.

### 5.2 Auto-complétion Open Library (docs/SPECS.md §5.2 + §9.3)
- [x] Si ISBN fourni : proposition d’auto-complétion.
- [x] Sinon : recherche fuzzy titre+auteur + écran de confirmation admin.

### 5.3 Photo couverture (docs/SPECS.md §5.2)
- [x] Upload image + stockage via adapter + lien `cover_url`.
- [x] Optimisation côté UI via Next `<Image>` (docs/SPECS.md §15).

---

## Phase 6 — Synchronisation métadonnées (three-way merge) & writeback EPUB (security-critical)

### 6.1 Modèle de snapshot (docs/SPECS.md §5.3 + §3.2)
- [x] Définir JSON schema des champs synchronisés (titre, auteurs, description, langue, isbn, sujets, etc.).
- [x] Stocker `db_metadata` dans snapshot lors de sync.

### 6.2 Algorithme three-way merge (docs/SPECS.md §5.3)
- [x] Implémenter la logique champ par champ (cas 1/2/3/4 du pseudo-code).
- [x] Politique conflit : “le fichier gagne” (EPUB prioritaire en conflit).

### 6.3 Écriture retour dans l’EPUB (docs/SPECS.md §5.3)
- [x] Quand DB source de vérité (cas 3) : écrire dans OPF metadata.
- [x] Re-hasher le fichier, mettre à jour `content_hash`, et gérer impact dédup.
- [x] Mettre à jour `BookFile` et chemins si nécessaire.

### 6.4 UI Admin “Re-sync métadonnées” (docs/SPECS.md §11.2 Book Detail)
- [x] Bouton admin dans Book Detail.
- [x] Afficher résultat : champs modifiés, conflits résolus.

---

## Phase 7 — Soft delete, purge, intégrité

### 7.1 Soft delete standard (docs/SPECS.md §5.4)
- [ ] Soft delete `Book.deleted_at` (et cohérence BookFile).
- [ ] Le fichier reste dans storage.

### 7.2 Restauration (docs/SPECS.md §5.4)
- [ ] Restore sur ré-upload (hash/filename).
- [ ] Restaurer relations nécessaires (shelves, tags, progress, annotations) si conservées.

### 7.3 Purge définitive (docs/SPECS.md §5.4)
- [ ] Action admin : suppression storage + suppression DB (ou hard delete contrôlé).
- [ ] Empêcher purge si contraintes métier (ou implémenter cascade contrôlée).

---

## Phase 8 — Déduplication (hash + fuzzy) & résolution admin

### 8.1 Scan automatique (docs/SPECS.md §5.5)
- [ ] Comparer `BookFile.content_hash` sur actifs.
- [ ] Sortie : clusters/paires.

### 8.2 Scan fuzzy (docs/SPECS.md §5.5 + §7.1)
- [ ] Similarité titre+auteurs via trigram/Levenshtein (Postgres `pg_trgm` recommandé).
- [ ] Seuils configurables pour réduire faux positifs.

### 8.3 UI Admin doublons (docs/SPECS.md §5.5 + §11.2 Admin)
- [ ] Liste des paires + vue diff côte à côte (métadonnées, cover, format, hash).
- [ ] Actions : merge / ignore.

### 8.4 Merge (docs/SPECS.md §5.5)
- [ ] Fusion : transfert shelves/annotations/progress/tags/recommendations si pertinent.
- [ ] Gestion Book absorbé : soft delete ou purge selon choix.
- [ ] Audit trail minimal (log admin).

---

## Phase 9 — Import Calibre

### 9.1 Parsing Calibre `metadata.db` (docs/SPECS.md §5.6)
- [ ] Upload du fichier SQLite `metadata.db`.
- [ ] Lire tables Calibre nécessaires (books/authors/tags/series/formats/cover).

### 9.2 Mapping Calibre → Shelf (docs/SPECS.md §5.6)
- [ ] Champs : titre, auteurs, tags, séries, description, couverture, formats.
- [ ] Tags Calibre → `Tag` (global).
- [ ] Séries → `Shelf` (manual).

### 9.3 Import fichiers EPUB (docs/SPECS.md §5.6)
- [ ] Import des EPUB vers storage adapter.
- [ ] Dédup via `content_hash` (ignorer doublons).

### 9.4 Rapport d’import (docs/SPECS.md §5.6)
- [ ] Stats : importés, ignorés, erreurs.
- [ ] UI admin : affichage exportable.

---

## Phase 10 — Étagères & organisation

### 10.1 Étagères manuelles (docs/SPECS.md §6.1)
- [ ] CRUD étagères par utilisateur.
- [ ] Un livre peut appartenir à plusieurs étagères (N:N).
- [ ] Tri : drag & drop + options alpha/date ajout.
- [ ] Icône personnalisable (emoji).

### 10.2 Étagères système (docs/SPECS.md §6.2)
- [ ] Favoris (non supprimable).
- [ ] En cours (non supprimable) basé sur `UserBookProgress.status='reading'`.
- [ ] UI : afficher en haut de `/shelves`.

### 10.3 Étagères dynamiques rule-based (docs/SPECS.md §6.3)
- [ ] Stockage `ShelfRule.rules` JSONB.
- [ ] Support `match: all|any`.
- [ ] Support opérateurs : eq/neq/contains/not_contains/in/not_in/gt/gte/lt/lte/after/before/has_any/has_all/is_empty/is_not_empty.
- [ ] Traduire règles en requêtes DB performantes (indexes nécessaires).

### 10.4 UI éditeur de règles (docs/SPECS.md §11.2 Shelf Detail)
- [ ] Builder visuel : ajout conditions, choix champ/opérateur/valeur.
- [ ] Validation client+serveur de la structure JSON.
- [ ] Prévisualisation des résultats (compte + exemples).

---

## Phase 11 — Tags globaux

### 11.1 Modèle & CRUD admin (docs/SPECS.md §6.4)
- [ ] CRUD tags (admin).
- [ ] Couleur hex, nom unique.

### 11.2 Assignation tags aux livres
- [ ] UI Book Detail : ajouter/retirer tags.
- [ ] Support tags dans recherche et règles d’étagères dynamiques.

---

## Phase 12 — Recherche, filtres, tri, pagination

### 12.1 Full-text (docs/SPECS.md §7.1)
- [ ] `tsvector` indexé sur title/authors/description/subjects.
- [ ] Support `plainto_tsquery` + `websearch_to_tsquery`.
- [ ] Ranking `ts_rank_cd` pondéré : titre A > auteurs B > sujets C > description D.

### 12.2 Fuzzy (docs/SPECS.md §7.1)
- [ ] Complément `pg_trgm` pour fautes de frappe.
- [ ] Stratégie de combinaison FTS + trigram (fallback ou blended score).

### 12.3 Filtres combinables (docs/SPECS.md §7.2)
- [ ] Format multi-select.
- [ ] Langue multi-select.
- [ ] Tags multi-select.
- [ ] Étagère select (de l’utilisateur).
- [ ] Statut lecture multi-select (progress).
- [ ] Auteur autocomplete.
- [ ] Éditeur autocomplete.
- [ ] Date ajout range.
- [ ] Nombre pages range slider.

### 12.4 Tri (docs/SPECS.md §7.3)
- [ ] Titre A-Z / Z-A.
- [ ] Date d’ajout.
- [ ] Date de publication.
- [ ] Auteur.
- [ ] Progression de lecture.
- [ ] Nombre de pages.

### 12.5 Pagination (docs/SPECS.md §7.4)
- [ ] Cursor-based pagination (pas d’OFFSET).
- [ ] Préférence taille page (12/24/48) en `UserPreference`.
- [ ] Option infinite scroll en préférence user.

---

## Phase 13 — Reader intégré (EPUB)

### 13.1 Rendu & navigation (docs/SPECS.md §8.1)
- [ ] Intégrer epub.js (ou Foliate.js) dans une route `/reader/[id]`.
- [ ] TOC (chapitres) + navigation page simulée.
- [ ] Barre de progression globale.
- [ ] Charger le reader en lazy import (docs/SPECS.md §15).

### 13.2 Sauvegarde progression (docs/SPECS.md §8.1)
- [ ] Auto-save CFI côté serveur toutes les 30s.
- [ ] Save à la fermeture (unload/route leave).
- [ ] Table `UserBookProgress` (progress 0..1, status, timestamps).

### 13.3 Personnalisation reader (docs/SPECS.md §8.2 + §3.2 UserPreference)
- [ ] Police (system/serif/sans/dyslexic).
- [ ] Taille 12–32px.
- [ ] Interligne 1.0–2.5.
- [ ] Marges (narrow/normal/wide) via px.
- [ ] Thème (light/dark/sepia).
- [ ] Mode paginé vs scroll continu.
- [ ] Persist préférence en DB par user.

### 13.4 Annotations (docs/SPECS.md §8.3)
- [ ] Highlight : sélection + choix couleur (jaune/vert/bleu/rose/violet).
- [ ] Notes attachées à highlight ou position.
- [ ] Bookmark à position.
- [ ] Panneau latéral : liste annotations du livre.
- [ ] Export annotations en Markdown.
- [ ] Sync serveur (multi-device).

### 13.5 Sanitization & sécurité reader (docs/SPECS.md §14)
- [ ] Sanitizer du contenu rendu (protection XSS).
- [ ] Stratégie CSS/iframe/DOM pour réduire surface d’attaque EPUB.

---

## Phase 14 — PWA & offline

### 14.1 Manifest & install (docs/SPECS.md §11.4)
- [ ] `manifest.json` (icônes, couleurs, `display: standalone`).
- [ ] Install prompt mobile.

### 14.2 Service worker (docs/SPECS.md §8.4 + §11.4)
- [ ] Cache app shell.
- [ ] Cache EPUB “téléchargés” (offline reading).
- [ ] Offline fallback page.

### 14.3 Sync retour en ligne (docs/SPECS.md §8.4)
- [ ] File d’attente : progression + annotations.
- [ ] Résolution conflits côté serveur (timestamps/last-write-wins ou règles explicites).

### 14.4 Quotas (docs/SPECS.md §8.4)
- [ ] Limite configurable stockage local.
- [ ] UI : affichage utilisation + purge sélective.

---

## Phase 15 — Enrichissement métadonnées (Open Library)

### 15.1 Client Open Library (docs/SPECS.md §9.1)
- [ ] Endpoints : ISBN `/isbn/{isbn}.json`, search `/search.json`, covers `/b/isbn/{isbn}-L.jpg`.
- [ ] Timeouts, retries prudents.

### 15.2 Stratégie d’enrichissement (docs/SPECS.md §9.3)
- [ ] Extraction EPUB d’abord.
- [ ] Si ISBN : enrichir direct.
- [ ] Sinon : fuzzy titre+auteur + confirmation admin.

### 15.3 Rate limit & cache (docs/SPECS.md §9.3)
- [ ] Rate limit 1 req/s (config env).
- [ ] Cache réponses 30 jours (DB ou Redis optionnel).

### 15.4 Champs enrichis (docs/SPECS.md §9.2)
- [ ] Appliquer règles champ par champ (priorité EPUB vs OpenLibrary).
- [ ] Gestion cover hi-res (préférence hi-res si disponible).

---

## Phase 16 — UI (design system, pages, responsive)

### 16.1 Design system (docs/SPECS.md §11.1)
- [ ] Appliquer palette, typographies, ombres, radius, boutons pill.
- [ ] Light par défaut + dark mode.
- [ ] S’assurer accessibilité (contraste, focus ring, tailles).

### 16.2 Pages principales (docs/SPECS.md §11.2)

#### 16.2.1 Library `/library`
- [ ] Vue grille (défaut) + vue liste (switch).
- [ ] Grille : covers en cards + titre/auteur/badge format.
- [ ] Liste : tableau colonnes triables.
- [ ] Search bar persistante.
- [ ] Panneau filtres latéral collapsible.
- [ ] Pagination ou infinite scroll (selon préférence).
- [ ] Indicateur progression sur chaque cover.
- [ ] FAB ajout (admin).

#### 16.2.2 Book Detail `/book/[id]`
- [ ] Layout cover + metadata.
- [ ] Actions : Lire, Ajouter à étagère, Favori, Télécharger EPUB.
- [ ] Afficher : titre, auteurs (liens), éditeur, date, ISBN, langue, pages, sujets/tags.
- [ ] Afficher progression de lecture.
- [ ] Liste annotations user.
- [ ] Actions admin : Modifier, Supprimer, Re-sync métadonnées.

#### 16.2.3 Reader `/reader/[id]`
- [ ] Plein écran, chrome minimal.
- [ ] Header fin : titre + retour + settings.
- [ ] Panneau TOC gauche.
- [ ] Panneau annotations droite.
- [ ] Barre progression bas.
- [ ] Mode focus.

#### 16.2.4 Shelves `/shelves`
- [ ] Liste étagères avec aperçu covers.
- [ ] Système en haut (favoris/en cours).
- [ ] Manuelles au milieu.
- [ ] Dynamiques en bas (icône filtre).

#### 16.2.5 Shelf Detail `/shelves/[id]`
- [ ] Vue grille/liste filtrée sur étagère.
- [ ] Drag & drop reorder (manuelle).
- [ ] Éditeur de règles (dynamique).

#### 16.2.6 Search `/search`
- [ ] Recherche instantanée (debounced).
- [ ] Filtres avancés.
- [ ] Highlight des termes trouvés.

#### 16.2.7 Admin `/admin`
- [ ] Users : liste + création + changement rôle + suppression.
- [ ] Duplicates : scanner + paires + merge/ignore.
- [ ] Import Calibre : upload metadata.db + chemin fichiers.
- [ ] Storage : stats (espace, fichiers).
- [ ] Settings : config instance (nom, OIDC, storage).

#### 16.2.8 Auth `/login`, `/register`
- [ ] Form minimaliste centré.
- [ ] Login local + bouton OIDC si configuré.
- [ ] Register désactivable (invitation-only / toggle `REGISTRATION_ENABLED`).

### 16.3 Responsive (docs/SPECS.md §11.3)
- [ ] Mobile : grille 2 colonnes, bottom nav, filtres modal, reader plein écran.
- [ ] Tablet : 3-4 colonnes, sidebar collapsible.
- [ ] Desktop : 5-6 colonnes, sidebar persistante, panels reader latéraux.

---

## Phase 17 — API interne & structure REST future

### 17.1 Server Actions vs API Routes (docs/SPECS.md §12.1)
- [ ] Server Actions pour interactions UI standard.
- [ ] API Routes pour : streaming EPUB, webhooks OIDC, accès programmatique.

### 17.2 Préparer structure REST (docs/SPECS.md §12.2)
- [ ] Concevoir handlers/routers pour routes listées (books/shelves/progress/annotations/search/admin).
- [ ] S’assurer compat auth + RBAC identiques.
- [ ] Réutiliser la logique de filtres/tri/pagination de la Library.

### 17.3 Sécurité API (docs/SPECS.md §14)
- [ ] Validation inputs côté serveur (schémas stricts).
- [ ] Rate limiting endpoints sensibles (upload/auth/admin/search).
- [ ] Sanitize sorties (reader content/annotations export).

---

## Phase 18 — Configuration & déploiement self-hosted

### 18.1 Variables d’environnement (docs/SPECS.md §13.1)
- [ ] Support complet : DB, Auth (secret/url), OIDC, Storage, S3, OpenLibrary rate limit, App (name/locale/registration), Redis.
- [ ] Ajouter checks de démarrage : env manquantes → erreurs claires.

### 18.2 Dockerfile & Compose (docs/SPECS.md §13.2)
- [ ] Image multi-stage, build prod.
- [ ] Compose : service `shelf`, `db` Postgres 16 + healthcheck.
- [ ] Volumes : library_data, covers, pg_data.
- [ ] Service `redis` optionnel.
- [ ] Documentation “first run” (migrations, création admin).

---

## Phase 19 — Sécurité (hardening)

### 19.1 Upload & contenu (docs/SPECS.md §14)
- [ ] Validation mime/size/zip.
- [ ] Protection contre zip-bombs (limites de taille/décompression).

### 19.2 Auth & sessions (docs/SPECS.md §14 + §4)
- [ ] Cookies httpOnly, secure en prod, sameSite approprié.
- [ ] CSRF sur mutations.

### 19.3 XSS & reader (docs/SPECS.md §14)
- [ ] Sanitization du HTML EPUB.
- [ ] CSP adaptée (si possible) pour réduire scripts inline.

### 19.4 Storage delivery (docs/SPECS.md §14)
- [ ] Confirmer : jamais de service direct depuis storage.
- [ ] Tous downloads/streams passent par endpoints auth + checks.

### 19.5 Audit logs minimaux
- [ ] Logs admin : import, purge, merge doublons, API key events, MCP usage.

---

## Phase 20 — Performance (priorités)

### 20.1 Rendering (docs/SPECS.md §15)
- [ ] Shell pages SSR/ISR, data dynamiques en RSC.
- [ ] Optimiser images covers via `<Image>` (lazy, WebP/AVIF).

### 20.2 DB perf (docs/SPECS.md §15)
- [ ] Cursor pagination partout (library/search/shelves).
- [ ] Indexes (GIN search_vector, hashes, pivots).

### 20.3 Streaming (docs/SPECS.md §15)
- [ ] Stream EPUB (ne pas charger en mémoire).

### 20.4 Bundle splitting (docs/SPECS.md §15)
- [ ] Lazy load reader + libs epub.

---

## Phase 21 — Recommandations personnalisées

### 21.1 Signaux & collecte (docs/SPECS.md §16.2)
- [ ] Capturer “finished” (très fort).
- [ ] Estimer “temps de lecture” via updates progression (fort).
- [ ] Favoris (fort).
- [ ] Annotations count (moyen).
- [ ] Ajout à étagère manuelle (faible).
- [ ] Abandonné (négatif).

### 21.2 Content-based scoring (docs/SPECS.md §16.3)
- [ ] Features : auteurs, sujets/tags (TF-IDF), langue, éditeur, pages.
- [ ] Implémenter similarity \(0.35 author + 0.30 subject + 0.15 tag + 0.10 language + 0.05 publisher + 0.05 pages\).

### 21.3 Collaborative filtering (docs/SPECS.md §16.3)
- [ ] Vecteur user `{book_id: score}`.
- [ ] Cosine similarity users.
- [ ] Seuil minimum 5 livres en commun.
- [ ] Préférence user pour désactiver (privacy).

### 21.4 Score final + diversité (docs/SPECS.md §16.4)
- [ ] Combiner : 0.60 content + 0.25 collab + 0.10 popularity + 0.05 recency.
- [ ] Pénalité diversité (éviter trop même auteur).

### 21.5 Calcul & stockage (docs/SPECS.md §16.5 + §16.6)
- [ ] Job background toutes les 6h.
- [ ] Recalcul à la demande.
- [ ] Invalidation après “finished” ou “favori”.
- [ ] Stocker top 50, servir par lots de 10.
- [ ] Cold start : popularité globale.
- [ ] `reasons` JSONB expliquant la reco.

### 21.6 UI recommandations (docs/SPECS.md §16.7)
- [ ] “Pour vous” sur Library (carrousel horizontal).
- [ ] Afficher raison principale.
- [ ] Bouton “Pas intéressé” (dismiss → améliore modèle).
- [ ] Page `/recommendations` + filtres par raison.

---

## Phase 22 — Serveur MCP (Model Context Protocol) (security-critical)

### 22.1 Transport & endpoint (docs/SPECS.md §17.2)
- [ ] Exposer `/api/mcp`.
- [ ] Support SSE (default) + Streamable HTTP.

### 22.2 Auth API keys (docs/SPECS.md §17.3)
- [ ] UI `/settings/api-keys` : créer/nommer/révoquer.
- [ ] Génération token opaque `sk_shelf_` + 48 chars random.
- [ ] Stocker uniquement hash SHA-256, jamais en clair.
- [ ] Stocker prefix pour identification.
- [ ] Champs : last_used_at, expires_at, revoked_at.
- [ ] Permissions héritées du rôle user.

### 22.3 Rate limiting & audit (docs/SPECS.md §17.8)
- [ ] Rate limit : 60 req/min par API key.
- [ ] Logging appels MCP (audit).

### 22.4 Tools MCP (docs/SPECS.md §17.4)

#### 22.4.1 Lecture bibliothèque
- [ ] `search_books(query, filters?, limit?)`
- [ ] `get_book(book_id)`
- [ ] `list_books(page?, per_page?, sort?, filters?)`
- [ ] `get_book_content(book_id, chapter?)` (limite tokens)

#### 22.4.2 Annotations & progression
- [ ] `get_annotations(book_id, type?)`
- [ ] `get_all_annotations(limit?, offset?)`
- [ ] `get_reading_progress(book_id?)`
- [ ] `create_annotation(book_id, type, content, note?)`

#### 22.4.3 Étagères
- [ ] `list_shelves()`
- [ ] `get_shelf_books(shelf_id)`
- [ ] `add_to_shelf(book_id, shelf_id)`
- [ ] `remove_from_shelf(book_id, shelf_id)`

#### 22.4.4 Recommandations
- [ ] `get_recommendations(limit?)`
- [ ] `dismiss_recommendation(book_id)`

#### 22.4.5 Admin-only
- [ ] `add_book(...)` (physique)
- [ ] `update_book(book_id, fields)`
- [ ] `delete_book(book_id)` (soft delete)
- [ ] `scan_duplicates()`

### 22.5 Resources MCP (docs/SPECS.md §17.5)
- [ ] `shelf://library/stats`
- [ ] `shelf://user/reading-list`
- [ ] `shelf://user/favorites`
- [ ] `shelf://user/recent-annotations`
- [ ] `shelf://book/{id}/metadata`
- [ ] `shelf://book/{id}/annotations`
- [ ] `shelf://shelves`

### 22.6 Prompts MCP (docs/SPECS.md §17.6)
- [ ] `summarize_book`
- [ ] `reading_insights`
- [ ] `find_similar`
- [ ] `shelf_curator`
- [ ] `quote_finder`

### 22.7 Doc client config (docs/SPECS.md §17.7)
- [ ] Fournir snippet JSON “mcpServers.shelf.url + Authorization Bearer sk_shelf_...”.
- [ ] Ajouter guide de rotation/revocation keys.

### 22.8 Implémentation SDK (docs/SPECS.md §17.8)
- [ ] Intégrer `@modelcontextprotocol/sdk`.
- [ ] Implémenter extraction texte chapitre `get_book_content` avec limite tokens.

---

## Phase 23 — Tests (qualité)

### 23.1 Unit tests (docs/SPECS.md §18)
- [ ] Vitest : parsing metadata EPUB.
- [ ] Vitest : algorithme three-way merge.
- [ ] Vitest : scoring recommendations.

### 23.2 Integration tests (docs/SPECS.md §18)
- [ ] Vitest + Prisma test DB : API routes & Server Actions.
- [ ] Vitest : MCP tools end-to-end (auth key + tool call).

### 23.3 Component tests (docs/SPECS.md §18)
- [ ] Testing Library : composants UI (Library grid/list, filters, shelf rule builder, reader panels).

### 23.4 E2E Playwright (docs/SPECS.md §18)
- [ ] Flux auth (register/login/OIDC si possible).
- [ ] Flux upload EPUB (admin) + book detail + read.
- [ ] Reader : save progress, annotations, export MD.
- [ ] Recherche : FTS + filtres + tri + pagination.
- [ ] Recommandations : afficher + dismiss.

---

## Phase 24 — CI/CD & release readiness

### 24.1 GitHub Actions (docs/SPECS.md §2)
- [ ] Lint.
- [ ] Tests unit/integration/component.
- [ ] Build.
- [ ] Build Docker image.

### 24.2 Observabilité minimale
- [ ] Logs structurés pour actions critiques (upload, sync, admin merges, MCP, API keys).
- [ ] Métriques simples (optionnel) : latence search, taux erreurs OpenLibrary, etc.

---

## Phase 25 — Glossaire & docs

### 25.1 Glossaire (docs/SPECS.md §19)
- [ ] Vérifier termes : CFI, three-way merge, storage adapter, dynamic shelf, soft delete, content hash, OPF, MCP, content-based/collaborative filtering, API key, cold start.
- [ ] Ajouter un “developer glossary” si besoin (CFI/OPF implications).

### 25.2 Documentation opérateur self-hosted
- [ ] Guide docker-compose (env, volumes, upgrades, backups).
- [ ] Guide sécurité : rotation secrets, OIDC, CORS, rate limits.
- [ ] Guide stockage : local vs S3/MinIO, migrations de storage.

---

## Phase 26 — Critères de complétude V1 (check final)

### 26.1 Fonctionnel
- [ ] Upload EPUB admin + extraction + OpenLibrary + search vector.
- [ ] Création livre physique + cover.
- [ ] Library/search/shelves/reader/admin conformes aux specs UI.
- [ ] Annotations + export Markdown.
- [ ] PWA offline : cache EPUB + sync.
- [ ] Recommandations : calcul, stockage, UI, dismiss.
- [ ] MCP : endpoint, auth keys, tools/resources/prompts, rate limit, audit.

### 26.2 Sécurité & conformité spec
- [ ] RBAC complet admin/reader.
- [ ] Fichiers servis uniquement via endpoints authentifiés.
- [ ] Upload durci + reader sanitization XSS.
- [ ] Rate limiting auth/upload/MCP.

### 26.3 Performance
- [ ] Cursor pagination.
- [ ] Indexes (search_vector/hashes/pivots).
- [ ] Reader lazy load.
- [ ] Streaming fichiers.

### 26.4 Qualité
- [ ] Suite de tests (unit/integration/component/e2e) couvrant flux critiques.
- [ ] CI verte (lint/tests/build/docker).

