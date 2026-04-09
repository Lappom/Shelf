# Shelf — Cahier des Charges V1

## 1. Vision

**Shelf** est une application web self-hosted de gestion de bibliothèque personnelle. Elle permet de cataloguer, organiser et lire des livres numériques (EPUB) ainsi que de référencer des livres physiques. L'application offre un reader intégré, l'enrichissement automatique des métadonnées via Open Library, et une gestion multi-utilisateurs avec étagères, favoris et suivi de lecture.

### Principes directeurs

- **Self-hosted first** — Déploiement simple via Docker Compose, données sous contrôle de l'utilisateur.
- **Offline-capable** — PWA responsive, lecture possible hors-ligne après téléchargement.
- **Metadata-rich** — Enrichissement automatique, sync bidirectionnelle, déduplication intelligente.
- **Beautiful by default** — Interface inspirée du design system ElevenLabs (voir `DESIGN.md`).

---

## 2. Stack Technique

| Couche | Technologie | Justification |
|--------|-------------|---------------|
| Frontend | Next.js 16+ (App Router) | SSR, RSC, routing file-based, PWA-ready |
| UI | Tailwind CSS 4 + shadcn/ui | Conforme au design system, composants accessibles |
| State | Zustand ou React Context | State client léger pour le reader et les préférences |
| Backend | Next.js API Routes + Server Actions | Monorepo, pas de serveur séparé |
| ORM | Prisma | Type-safe, migrations, introspection PostgreSQL |
| Base de données | PostgreSQL 16 | JSONB pour métadonnées flexibles, full-text search natif |
| Auth | NextAuth.js (Auth.js v5) | Local credentials + OIDC provider configurable |
| Stockage fichiers | Local filesystem + S3/MinIO (configurable) | Abstraction via un storage adapter |
| Reader EPUB | epub.js (Foliate.js en alternative) | Rendu EPUB in-browser, annotations, progression |
| Traitement EPUB | epub-parser / JSZip | Extraction métadonnées, couvertures, modification EPUB |
| Recherche | PostgreSQL `tsvector` + `pg_trgm` | Full-text search sans dépendance externe |
| Cache | Redis (optionnel) | Sessions, cache métadonnées Open Library |
| Conteneurisation | Docker + Docker Compose | Image unique multi-stage |
| CI/CD | GitHub Actions | Lint, tests, build Docker |

### Arborescence projet

```
shelf/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/             # Routes auth (login, register)
│   │   ├── (app)/              # Routes protégées
│   │   │   ├── library/        # Bibliothèque principale
│   │   │   ├── book/[id]/      # Détail livre
│   │   │   ├── reader/[id]/    # Reader intégré
│   │   │   ├── shelves/        # Étagères / collections
│   │   │   ├── search/         # Recherche
│   │   │   └── admin/          # Administration
│   │   ├── api/                # API Routes
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── book/               # Composants livre
│   │   ├── reader/             # Composants reader
│   │   ├── shelf/              # Composants étagère
│   │   └── layout/             # Navigation, sidebar
│   ├── lib/
│   │   ├── db/                 # Prisma client, queries
│   │   ├── storage/            # Storage adapter (local/S3)
│   │   ├── epub/               # Parsing, modification EPUB
│   │   ├── metadata/           # Open Library client
│   │   ├── auth/               # Auth config
│   │   └── utils/
│   ├── hooks/
│   └── types/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── public/
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── docs/
└── tests/
```

---

## 3. Modèle de Données

### 3.1 Schéma Entité-Relation

```
User ──1:N── UserBookProgress
User ──1:N── UserAnnotation
User ──1:N── UserPreference
User ──1:N── UserShelf (ownership)

Book ──1:N── UserBookProgress
Book ──1:N── UserAnnotation
Book ──1:N── BookFile
Book ──N:N── Shelf (via BookShelf)
Book ──N:N── Tag (via BookTag)
Book ──1:1── BookMetadataSnapshot

Shelf ──N:N── Book (via BookShelf)
Shelf ──1:1── ShelfRule (optional, for dynamic shelves)

User ──1:N── UserRecommendation
User ──1:N── ApiKey
```

### 3.2 Tables principales

#### `User`

| Colonne | Type | Description |
|---------|------|-------------|
| id | UUID | PK |
| email | VARCHAR(255) | Unique |
| username | VARCHAR(100) | Unique, affiché |
| password_hash | VARCHAR(255) | Nullable (OIDC users) |
| role | ENUM('admin', 'reader') | Rôle global |
| avatar_url | TEXT | Nullable |
| oidc_provider | VARCHAR(100) | Nullable |
| oidc_sub | VARCHAR(255) | Nullable |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| deleted_at | TIMESTAMPTZ | Soft delete |

#### `Book`

| Colonne | Type | Description |
|---------|------|-------------|
| id | UUID | PK |
| title | VARCHAR(500) | |
| subtitle | VARCHAR(500) | Nullable |
| authors | JSONB | `["Prénom Nom", ...]` |
| isbn_10 | VARCHAR(10) | Nullable |
| isbn_13 | VARCHAR(13) | Nullable |
| publisher | VARCHAR(255) | Nullable |
| publish_date | VARCHAR(50) | Nullable, format flexible |
| language | VARCHAR(10) | Code ISO 639-1 |
| description | TEXT | Nullable |
| page_count | INTEGER | Nullable |
| subjects | JSONB | `["Fiction", "Sci-Fi", ...]` |
| cover_url | TEXT | Path relatif ou URL |
| format | ENUM('epub', 'physical', 'pdf', 'cbz', 'cbr', 'audiobook') | |
| content_hash | VARCHAR(64) | SHA-256 du fichier, nullable pour physique |
| open_library_id | VARCHAR(50) | Nullable, ex: `/works/OL123W` |
| metadata_source | ENUM('manual', 'epub', 'openlibrary', 'calibre') | Origine des métadonnées |
| added_by | UUID | FK → User |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| deleted_at | TIMESTAMPTZ | Soft delete |
| search_vector | TSVECTOR | Full-text search index |

#### `BookFile`

| Colonne | Type | Description |
|---------|------|-------------|
| id | UUID | PK |
| book_id | UUID | FK → Book |
| filename | VARCHAR(500) | Nom original du fichier |
| storage_path | TEXT | Chemin dans le storage adapter |
| file_size | BIGINT | En octets |
| mime_type | VARCHAR(100) | |
| content_hash | VARCHAR(64) | SHA-256 |
| created_at | TIMESTAMPTZ | |

#### `BookMetadataSnapshot`

Snapshot de la dernière synchronisation pour le three-way merge.

| Colonne | Type | Description |
|---------|------|-------------|
| id | UUID | PK |
| book_id | UUID | FK → Book, unique |
| epub_metadata | JSONB | Métadonnées extraites du fichier au dernier sync |
| db_metadata | JSONB | Métadonnées DB au dernier sync |
| synced_at | TIMESTAMPTZ | Dernière synchronisation |

#### `Shelf`

| Colonne | Type | Description |
|---------|------|-------------|
| id | UUID | PK |
| name | VARCHAR(255) | |
| description | TEXT | Nullable |
| type | ENUM('manual', 'dynamic', 'favorites', 'reading') | |
| owner_id | UUID | FK → User |
| is_public | BOOLEAN | Visible par les autres utilisateurs |
| icon | VARCHAR(50) | Emoji ou nom d'icône |
| sort_order | INTEGER | Ordre d'affichage |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

#### `ShelfRule` (étagères dynamiques)

| Colonne | Type | Description |
|---------|------|-------------|
| id | UUID | PK |
| shelf_id | UUID | FK → Shelf, unique |
| rules | JSONB | Règles de filtrage (voir section 6.3) |

#### `BookShelf` (pivot)

| Colonne | Type | Description |
|---------|------|-------------|
| book_id | UUID | FK → Book |
| shelf_id | UUID | FK → Shelf |
| added_at | TIMESTAMPTZ | |
| sort_order | INTEGER | Ordre dans l'étagère |

#### `Tag`

| Colonne | Type | Description |
|---------|------|-------------|
| id | UUID | PK |
| name | VARCHAR(100) | Unique |
| color | VARCHAR(7) | Hex color |

#### `BookTag` (pivot)

| Colonne | Type | Description |
|---------|------|-------------|
| book_id | UUID | FK → Book |
| tag_id | UUID | FK → Tag |

#### `UserBookProgress`

| Colonne | Type | Description |
|---------|------|-------------|
| id | UUID | PK |
| user_id | UUID | FK → User |
| book_id | UUID | FK → Book |
| progress | FLOAT | 0.0 à 1.0 |
| current_cfi | TEXT | EPUB CFI position |
| current_page | INTEGER | Nullable |
| status | ENUM('not_started', 'reading', 'finished', 'abandoned') | |
| started_at | TIMESTAMPTZ | Nullable |
| finished_at | TIMESTAMPTZ | Nullable |
| updated_at | TIMESTAMPTZ | |

Contrainte unique : `(user_id, book_id)`

#### `UserAnnotation`

| Colonne | Type | Description |
|---------|------|-------------|
| id | UUID | PK |
| user_id | UUID | FK → User |
| book_id | UUID | FK → Book |
| type | ENUM('highlight', 'note', 'bookmark') | |
| cfi_range | TEXT | EPUB CFI range |
| content | TEXT | Texte surligné ou note |
| note | TEXT | Note associée au highlight |
| color | VARCHAR(7) | Couleur du highlight |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

#### `UserPreference`

| Colonne | Type | Description |
|---------|------|-------------|
| id | UUID | PK |
| user_id | UUID | FK → User, unique |
| theme | ENUM('light', 'dark', 'system') | |
| reader_font_family | VARCHAR(100) | |
| reader_font_size | INTEGER | En px |
| reader_line_height | FLOAT | |
| reader_margin | INTEGER | En px |
| reader_theme | ENUM('light', 'dark', 'sepia') | |
| library_view | ENUM('grid', 'list') | |
| books_per_page | INTEGER | Default 24 |

---

## 4. Authentification & Autorisation

### 4.1 Méthode d'authentification

- **Local** : email + mot de passe (bcrypt, min 8 caractères).
- **OIDC** : provider configurable via variables d'environnement. Support Authelia, Keycloak, Google, ou tout provider OIDC-compliant.
- Premier utilisateur inscrit → rôle `admin` automatique.

### 4.2 Rôles et permissions

| Action | Admin | Reader |
|--------|-------|--------|
| Voir la bibliothèque | ✅ | ✅ |
| Ajouter un livre | ✅ | ❌ |
| Modifier les métadonnées | ✅ | ❌ |
| Supprimer un livre | ✅ | ❌ |
| Lire un livre (reader) | ✅ | ✅ |
| Gérer ses étagères | ✅ | ✅ |
| Gérer ses favoris/en cours | ✅ | ✅ |
| Annoter / surligner | ✅ | ✅ |
| Gérer les utilisateurs | ✅ | ❌ |
| Scanner les doublons | ✅ | ❌ |
| Importer depuis Calibre | ✅ | ❌ |
| Déclencher l'enrichissement | ✅ | ❌ |
| Modifier les tags globaux | ✅ | ❌ |
| Voir ses recommandations | ✅ | ✅ |
| Générer des API keys MCP | ✅ | ✅ |

### 4.3 Sessions

- JWT stocké en httpOnly cookie.
- Durée de session : 30 jours (configurable).
- Refresh token silencieux.

---

## 5. Gestion des Livres

### 5.1 Ajout d'un livre numérique (EPUB)

**Flux d'upload :**

1. L'admin upload un fichier EPUB via l'interface.
2. Le serveur calcule le SHA-256 (`content_hash`).
3. **Vérification soft-delete** : si un `Book` supprimé possède le même `content_hash` ou `filename`, il est restauré au lieu d'en créer un nouveau.
4. **Vérification doublon** : si un `Book` actif possède le même `content_hash`, l'upload est rejeté avec un lien vers l'existant.
5. Le fichier est stocké via le storage adapter.
6. Les métadonnées sont extraites de l'EPUB (titre, auteurs, ISBN, description, couverture, langue).
7. Un `BookMetadataSnapshot` est créé avec les métadonnées EPUB.
8. **Enrichissement Open Library** : si un ISBN est trouvé, les métadonnées sont complétées depuis Open Library (description, sujets, nombre de pages, couverture haute résolution).
9. L'entrée `Book` est créée avec fusion des métadonnées (EPUB prioritaire, Open Library en complément).
10. Le `search_vector` est calculé à partir du titre, auteurs, description et sujets.

### 5.2 Ajout d'un livre physique

1. L'admin remplit manuellement un formulaire (titre, auteurs, ISBN, etc.).
2. Si un ISBN est fourni, proposition d'auto-complétion via Open Library.
3. Upload optionnel d'une photo de couverture.
4. Le `format` est `physical`, pas de `BookFile` associé, pas de `content_hash`.

### 5.3 Synchronisation bidirectionnelle des métadonnées (three-way merge)

**Principe** : à chaque sync, on compare trois sources :
- **EPUB** : métadonnées extraites du fichier.
- **DB** : métadonnées actuelles en base.
- **Snapshot** : dernière version synchronisée (`BookMetadataSnapshot`).

**Algorithme :**

```
Pour chaque champ (titre, auteurs, description, etc.) :
  epub_value   = métadonnée extraite du fichier EPUB
  db_value     = métadonnée actuelle en base
  snap_value   = métadonnée du dernier snapshot

  Si epub_value == snap_value == db_value :
    → Pas de changement

  Si epub_value != snap_value ET db_value == snap_value :
    → Le fichier a changé → prendre epub_value
    → Mettre à jour DB + snapshot

  Si db_value != snap_value ET epub_value == snap_value :
    → La DB a changé → prendre db_value
    → Écrire db_value dans l'EPUB + mettre à jour snapshot

  Si epub_value != snap_value ET db_value != snap_value :
    → Conflit : les deux ont changé → le fichier gagne
    → Prendre epub_value
    → Mettre à jour DB + snapshot
```

**Écriture retour dans l'EPUB** : quand la DB est source de vérité (cas 3), les métadonnées modifiées sont écrites dans le fichier EPUB (OPF metadata). Le fichier est re-hashé et le `content_hash` mis à jour.

### 5.4 Soft delete et restauration

- Quand un fichier est supprimé (manuellement ou fichier disparu) : `deleted_at` est renseigné, le fichier reste en storage.
- Quand un fichier est ré-uploadé : matching par `content_hash` ou `filename` → restauration (`deleted_at = NULL`), mise à jour du `BookFile`.
- Purge définitive : action admin, supprime le fichier du storage et la ligne en base.

### 5.5 Déduplication

- **Scan automatique** : comparaison des `content_hash` sur tous les `BookFile` actifs.
- **Scan fuzzy** : comparaison titre + auteurs avec algorithme de similarité (Levenshtein / trigram via `pg_trgm`).
- **Interface admin** : liste des paires de doublons potentiels, avec diff des métadonnées côte à côte.
- **Résolution** : l'admin choisit de fusionner (un livre absorbe l'autre, transfert des étagères/annotations/progression) ou d'ignorer la paire.

### 5.6 Import Calibre

- Import d'une bibliothèque Calibre existante via le fichier `metadata.db` (SQLite).
- Mapping des champs Calibre → Shelf (titre, auteurs, tags, séries, description, couverture, formats).
- Import des fichiers EPUB associés vers le storage adapter.
- Les tags Calibre deviennent des `Tag` dans Shelf.
- Les séries Calibre deviennent des `Shelf` de type `manual`.
- Rapport d'import : nombre de livres importés, ignorés (doublons), erreurs.

---

## 6. Étagères et Organisation

### 6.1 Étagères manuelles

- Chaque utilisateur peut créer des étagères personnelles.
- Un livre peut appartenir à plusieurs étagères (N:N).
- Tri personnalisable (drag & drop ou alphabétique / date d'ajout).
- Icône personnalisable (emoji).

### 6.2 Étagères système

Créées automatiquement pour chaque utilisateur, non supprimables :

| Étagère | Type | Description |
|---------|------|-------------|
| Favoris | `favorites` | Livres marqués comme favoris |
| En cours | `reading` | Livres avec `status = 'reading'` dans `UserBookProgress` |

### 6.3 Étagères dynamiques (rule-based)

Étagères dont le contenu est calculé dynamiquement à partir de règles stockées en JSONB.

**Format des règles :**

```json
{
  "match": "all",
  "conditions": [
    { "field": "language", "operator": "eq", "value": "fr" },
    { "field": "subjects", "operator": "contains", "value": "Science Fiction" },
    { "field": "authors", "operator": "contains", "value": "Asimov" },
    { "field": "format", "operator": "in", "value": ["epub", "pdf"] },
    { "field": "page_count", "operator": "gte", "value": 300 },
    { "field": "tags", "operator": "has_any", "value": ["to-read", "classic"] },
    { "field": "added_at", "operator": "after", "value": "2024-01-01" }
  ]
}
```

**Opérateurs supportés** : `eq`, `neq`, `contains`, `not_contains`, `in`, `not_in`, `gt`, `gte`, `lt`, `lte`, `after`, `before`, `has_any`, `has_all`, `is_empty`, `is_not_empty`.

**Match** : `all` (AND) ou `any` (OR).

### 6.4 Tags

- Tags globaux créés par les admins.
- Assignables à n'importe quel livre.
- Couleur personnalisable.
- Utilisables dans les règles d'étagères dynamiques et dans la recherche.

---

## 7. Recherche et Pagination

### 7.1 Recherche full-text

- Index `tsvector` sur : `title`, `authors` (éléments JSONB), `description`, `subjects` (éléments JSONB).
- Support des recherches en langue naturelle via `plainto_tsquery` et `websearch_to_tsquery`.
- Ranking par `ts_rank_cd` avec pondération : titre (A) > auteurs (B) > sujets (C) > description (D).
- Recherche fuzzy en complément via `pg_trgm` pour tolérer les fautes de frappe.

### 7.2 Filtres combinables

| Filtre | Type | Valeurs |
|--------|------|---------|
| Format | Multi-select | epub, physical, pdf, cbz, cbr, audiobook |
| Langue | Multi-select | Codes ISO 639-1 |
| Tags | Multi-select | Liste des tags |
| Étagère | Select | Liste des étagères de l'utilisateur |
| Statut de lecture | Multi-select | not_started, reading, finished, abandoned |
| Auteur | Autocomplete | |
| Éditeur | Autocomplete | |
| Date d'ajout | Date range | |
| Nombre de pages | Range slider | |

### 7.3 Tri

Options : titre (A-Z / Z-A), date d'ajout, date de publication, auteur, progression de lecture, nombre de pages.

### 7.4 Pagination

- Cursor-based pagination pour les performances.
- Taille de page configurable par utilisateur (12, 24, 48).
- Infinite scroll en option (préférence utilisateur).

---

## 8. Reader Intégré

### 8.1 EPUB Reader

- Basé sur **epub.js** ou **Foliate.js**.
- Navigation par chapitre (table des matières) et par page simulée.
- Barre de progression globale.
- Sauvegarde automatique de la position (CFI) côté serveur toutes les 30 secondes et à la fermeture.

### 8.2 Personnalisation du reader

| Option | Valeurs |
|--------|---------|
| Police | System, Serif, Sans-serif, Dyslexic |
| Taille de police | 12px – 32px |
| Interligne | 1.0 – 2.5 |
| Marges | Étroites, Normales, Larges |
| Thème du reader | Light, Dark, Sepia |
| Défilement | Paginé ou scroll continu |

### 8.3 Annotations et highlights

- **Highlight** : sélection de texte → choix de couleur (jaune, vert, bleu, rose, violet).
- **Note** : texte libre attaché à un highlight ou à une position.
- **Bookmark** : marque-page à une position.
- Panneau latéral listant toutes les annotations du livre.
- Export des annotations en Markdown.
- Stockage côté serveur → synchronisation entre appareils.

### 8.4 Lecture hors-ligne (PWA)

- Service worker pour mettre en cache les fichiers EPUB téléchargés.
- Sync des annotations et de la progression au retour en ligne.
- Limite configurable de stockage local.

---

## 9. Enrichissement des Métadonnées

### 9.1 Open Library

- **Endpoint** : `https://openlibrary.org/api/`
- **Recherche par ISBN** : `https://openlibrary.org/isbn/{isbn}.json`
- **Recherche par titre/auteur** : `https://openlibrary.org/search.json?title=...&author=...`
- **Couvertures** : `https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg`

### 9.2 Champs enrichis

| Champ | Source EPUB | Source Open Library |
|-------|-------------|---------------------|
| Titre | ✅ (prioritaire) | ✅ (fallback) |
| Auteurs | ✅ (prioritaire) | ✅ (fallback) |
| ISBN | ✅ | ✅ |
| Description | ✅ | ✅ (complète souvent) |
| Couverture | ✅ (extraite) | ✅ (haute résolution) |
| Sujets | ❌ | ✅ |
| Nombre de pages | ❌ | ✅ |
| Éditeur | ✅ | ✅ |
| Date de publication | ✅ | ✅ |
| Open Library ID | ❌ | ✅ |

### 9.3 Stratégie

1. Extraction des métadonnées EPUB (source primaire).
2. Si ISBN présent → enrichissement Open Library.
3. Sinon → recherche fuzzy par titre + auteur sur Open Library, proposition à l'admin de confirmer le match.
4. Rate limiting : max 1 requête/seconde vers Open Library (respect des conditions d'utilisation).
5. Cache des réponses Open Library en base (ou Redis si disponible) pendant 30 jours.

---

## 10. Stockage des Fichiers

### 10.1 Storage Adapter

Interface abstraite avec deux implémentations :

```typescript
interface StorageAdapter {
  upload(file: Buffer, path: string): Promise<string>;
  download(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  getUrl(path: string): Promise<string>;
  getSize(path: string): Promise<number>;
}
```

### 10.2 Local Storage

- Répertoire configurable via `STORAGE_PATH` (défaut : `/data/library`).
- Structure : `/{format}/{author}/{filename}`.
- Couvertures : `/covers/{book_id}.{ext}`.

### 10.3 S3/MinIO

- Configuration via variables d'environnement : `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`.
- Même structure de chemins que le local storage.
- Presigned URLs pour le streaming vers le reader.

---

## 11. Interface Utilisateur

### 11.1 Design System

L'interface suit le design system décrit dans `DESIGN.md`, inspiré d'ElevenLabs :

- **Palette** : canvas blanc/gris chaud, texte noir, accents stone (`#f5f2ef`).
- **Typographie** : Waldenburg 300 pour les titres, Inter pour le corps.
- **Ombres** : multi-couches à opacité sub-0.1, teintes chaudes.
- **Boutons** : pill shape (9999px), variantes black/white/warm stone.
- **Cartes** : radius 16-24px, ombres subtiles.
- **Thèmes** : Light (défaut) + Dark mode.

### 11.2 Pages principales

#### Library (`/library`)
- Vue grille (défaut) ou liste, switchable.
- Grille : couvertures de livres en cards avec titre, auteur, badge de format.
- Liste : tableau avec colonnes triables.
- Barre de recherche persistante en haut.
- Filtres dans un panneau latéral collapsible.
- Pagination en bas ou infinite scroll.
- Indicateur de progression de lecture sur chaque couverture.
- FAB (Floating Action Button) d'ajout pour les admins.

#### Book Detail (`/book/[id]`)
- Couverture grande à gauche, métadonnées à droite.
- Boutons : Lire, Ajouter à une étagère, Favori, Télécharger (EPUB).
- Section métadonnées : titre, auteurs (liens), éditeur, date, ISBN, langue, pages, sujets/tags.
- Progression de lecture avec barre visuelle.
- Liste des annotations de l'utilisateur.
- Actions admin : Modifier, Supprimer, Re-sync métadonnées.

#### Reader (`/reader/[id]`)
- Plein écran, chrome minimal.
- Header fin : titre du livre, bouton retour, menu settings.
- Zone de lecture centrale.
- Panneau latéral TOC (table of contents) à gauche.
- Panneau latéral annotations à droite.
- Barre de progression en bas.
- Mode focus : masque tout sauf le texte.

#### Shelves (`/shelves`)
- Liste des étagères de l'utilisateur avec aperçu des couvertures.
- Étagères système (Favoris, En cours) en haut.
- Étagères manuelles au milieu.
- Étagères dynamiques en bas (avec icône de filtre).

#### Shelf Detail (`/shelves/[id]`)
- Même vue grille/liste que la Library, filtrée sur l'étagère.
- Drag & drop pour réordonner (étagères manuelles).
- Éditeur de règles visuel pour les étagères dynamiques.

#### Search (`/search`)
- Recherche full-text avec résultats instantanés (debounced).
- Filtres avancés.
- Highlighting des termes recherchés dans les résultats.

#### Admin (`/admin`)
- **Users** : liste, création, modification de rôle, suppression.
- **Duplicates** : scanner, résultats par paires, actions merge/ignore.
- **Import Calibre** : upload `metadata.db` + chemin vers les fichiers.
- **Storage** : statistiques (espace utilisé, nombre de fichiers).
- **Settings** : configuration générale (nom de l'instance, OIDC, storage).

#### Auth (`/login`, `/register`)
- Formulaire minimaliste centré.
- Login local + bouton OIDC si configuré.
- Register désactivable par l'admin (invitation-only).

### 11.3 Responsive

| Breakpoint | Comportement |
|------------|-------------|
| Mobile (<768px) | 2 colonnes grille, navigation bottom bar, reader plein écran, filtres en modal |
| Tablet (768-1024px) | 3-4 colonnes grille, sidebar collapsible |
| Desktop (>1024px) | 5-6 colonnes grille, sidebar persistante, panels latéraux reader |

### 11.4 PWA

- `manifest.json` avec icônes, couleurs, `display: standalone`.
- Service worker : cache app shell + fichiers EPUB téléchargés.
- Install prompt sur mobile.
- Offline fallback page.

---

## 12. API

### 12.1 Endpoints internes (Server Actions + API Routes)

Les interactions UI passent principalement par des Server Actions Next.js. Les API Routes sont utilisées pour :

- Le streaming des fichiers EPUB vers le reader.
- Les webhooks (OIDC callback).
- Les endpoints nécessitant un accès programmatique.

### 12.2 Endpoints REST (futurs clients)

Prévoir dès la V1 une structure permettant d'exposer une API REST si besoin :

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/books` | Liste paginée avec filtres |
| GET | `/api/books/:id` | Détail d'un livre |
| POST | `/api/books` | Ajouter un livre |
| PATCH | `/api/books/:id` | Modifier les métadonnées |
| DELETE | `/api/books/:id` | Soft delete |
| POST | `/api/books/:id/upload` | Upload fichier |
| GET | `/api/books/:id/file` | Télécharger le fichier |
| GET | `/api/books/:id/cover` | Couverture |
| GET | `/api/shelves` | Étagères de l'utilisateur |
| POST | `/api/shelves` | Créer une étagère |
| PATCH | `/api/shelves/:id` | Modifier |
| DELETE | `/api/shelves/:id` | Supprimer |
| POST | `/api/shelves/:id/books` | Ajouter un livre |
| DELETE | `/api/shelves/:id/books/:bookId` | Retirer un livre |
| GET | `/api/progress/:bookId` | Progression de lecture |
| PUT | `/api/progress/:bookId` | Sauvegarder la progression |
| GET | `/api/annotations/:bookId` | Annotations |
| POST | `/api/annotations/:bookId` | Créer annotation |
| PATCH | `/api/annotations/:id` | Modifier |
| DELETE | `/api/annotations/:id` | Supprimer |
| GET | `/api/search?q=...` | Recherche full-text |
| POST | `/api/admin/scan-duplicates` | Scanner les doublons |
| POST | `/api/admin/import-calibre` | Import Calibre |
| GET | `/api/admin/users` | Liste des utilisateurs |

---

## 13. Configuration

### 13.1 Variables d'environnement

```env
# Database
DATABASE_URL=postgresql://shelf:password@localhost:5432/shelf

# Auth
NEXTAUTH_SECRET=<random-secret>
NEXTAUTH_URL=http://localhost:3000

# OIDC (optional)
OIDC_ISSUER=https://auth.example.com
OIDC_CLIENT_ID=shelf
OIDC_CLIENT_SECRET=<secret>

# Storage
STORAGE_TYPE=local          # local | s3
STORAGE_PATH=/data/library  # for local

# S3 (if STORAGE_TYPE=s3)
S3_ENDPOINT=http://minio:9000
S3_BUCKET=shelf
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_REGION=us-east-1

# Open Library
OPENLIBRARY_RATE_LIMIT=1    # requests per second

# App
APP_NAME=Shelf
REGISTRATION_ENABLED=true
DEFAULT_LOCALE=fr

# Redis (optional)
REDIS_URL=redis://localhost:6379
```

### 13.2 Docker Compose

```yaml
services:
  shelf:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://shelf:password@db:5432/shelf
      - STORAGE_TYPE=local
      - STORAGE_PATH=/data/library
    volumes:
      - library_data:/data/library
      - shelf_covers:/data/covers
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: shelf
      POSTGRES_PASSWORD: password
      POSTGRES_DB: shelf
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U shelf"]
      interval: 5s
      timeout: 5s
      retries: 5

  # Optional
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  library_data:
  shelf_covers:
  pg_data:
  redis_data:
```

---

## 14. Sécurité

- **Auth** : bcrypt pour les mots de passe, JWT httpOnly, CSRF protection.
- **Upload** : validation MIME type, taille max configurable (défaut 100MB), scan du contenu EPUB (ZIP valide).
- **SQL** : requêtes paramétrées via Prisma (pas d'injection).
- **XSS** : React escape par défaut, sanitization du contenu EPUB affiché dans le reader.
- **CORS** : restrictif, uniquement l'origine de l'app.
- **Rate limiting** : sur les endpoints d'auth et d'upload.
- **Storage** : les fichiers ne sont jamais servis directement, toujours via un endpoint authentifié.

---

## 15. Performance

- **ISR/SSR** : pages statiques pour le shell, données dynamiques en RSC.
- **Image optimization** : Next.js `<Image>` pour les couvertures avec lazy loading et formats modernes (WebP/AVIF).
- **Pagination cursor-based** : pas d'OFFSET, performances constantes.
- **Index DB** : `search_vector` (GIN), `content_hash`, `isbn_13`, `(user_id, book_id)` sur les tables de jointure.
- **Streaming** : les fichiers EPUB sont streamés, pas chargés intégralement en mémoire.
- **Bundle splitting** : le reader est chargé en lazy import (code splitting).

---

## 16. Recommandations Personnalisées

### 16.1 Principe

Chaque utilisateur reçoit des suggestions de livres basées sur ses habitudes de lecture, ses annotations, ses étagères et ses préférences implicites. Le système fonctionne entièrement en local (pas de service externe) et s'améliore au fil de l'utilisation.

### 16.2 Signaux collectés

| Signal | Poids | Source |
|--------|-------|--------|
| Livre terminé | Très fort | `UserBookProgress.status = 'finished'` |
| Temps de lecture élevé | Fort | Durée cumulée déduite des updates de progression |
| Ajouté aux favoris | Fort | Étagère `favorites` |
| Annotations nombreuses | Moyen | Nombre d'entrées `UserAnnotation` par livre |
| Ajouté à une étagère manuelle | Faible | `BookShelf` |
| Livre abandonné | Négatif | `UserBookProgress.status = 'abandoned'` |

### 16.3 Algorithme de scoring

Le moteur de recommandation repose sur deux axes complémentaires :

**1. Content-based filtering (similarité de contenu)**

Pour chaque livre apprécié par l'utilisateur, calculer un vecteur de caractéristiques :
- Auteurs (match exact = score élevé)
- Sujets / tags (intersection pondérée via TF-IDF sur la bibliothèque)
- Langue
- Éditeur
- Plage de nombre de pages (lecteur de pavés vs. courts)

Score de similarité entre deux livres :

```
similarity(A, B) =
    0.35 × author_overlap(A, B)
  + 0.30 × subject_cosine(A, B)
  + 0.15 × tag_jaccard(A, B)
  + 0.10 × same_language(A, B)
  + 0.05 × same_publisher(A, B)
  + 0.05 × page_count_proximity(A, B)
```

**2. Collaborative filtering (utilisateurs similaires)**

En contexte multi-utilisateurs, si deux utilisateurs ont des étagères et historiques proches, les livres appréciés par l'un et non lus par l'autre sont recommandés.

- Similarité entre utilisateurs : cosine similarity sur les vecteurs `{book_id: score}` (score = signal pondéré ci-dessus).
- Seuil minimum de livres en commun (5) pour éviter le bruit.
- Désactivable par l'utilisateur dans ses préférences (vie privée).

### 16.4 Score final de recommandation

```
recommendation_score(user, book) =
    0.60 × content_score(user, book)
  + 0.25 × collaborative_score(user, book)
  + 0.10 × popularity_score(book)
  + 0.05 × recency_bonus(book)
  - penalty_if_same_author_already_recommended
```

- `popularity_score` : nombre de lecteurs ayant terminé le livre / total d'utilisateurs.
- `recency_bonus` : boost pour les livres récemment ajoutés à la bibliothèque.
- Pénalité de diversité : éviter de recommander 5 livres du même auteur.

### 16.5 Calcul et stockage

| Aspect | Choix |
|--------|-------|
| Fréquence de calcul | Background job toutes les 6h + recalcul à la demande |
| Stockage | Table `UserRecommendation` avec scores pré-calculés |
| Nombre de recommandations | Top 50 par utilisateur, affichées par lots de 10 |
| Cold start | Nouveaux utilisateurs → recommandations basées sur la popularité globale |
| Invalidation | Recalcul déclenché après un livre terminé ou ajouté aux favoris |

### 16.6 Table `UserRecommendation`

| Colonne | Type | Description |
|---------|------|-------------|
| id | UUID | PK |
| user_id | UUID | FK → User |
| book_id | UUID | FK → Book |
| score | FLOAT | Score de recommandation (0.0 – 1.0) |
| reasons | JSONB | `["Même auteur que X", "Sujet similaire à Y"]` |
| seen | BOOLEAN | L'utilisateur a vu cette recommandation |
| dismissed | BOOLEAN | L'utilisateur a ignoré cette recommandation |
| computed_at | TIMESTAMPTZ | Date du dernier calcul |

Contrainte unique : `(user_id, book_id)`

### 16.7 Interface

- **Section "Pour vous"** sur la page Library : carrousel horizontal de couvertures recommandées.
- Chaque recommandation affiche la raison principale ("Parce que vous avez aimé *Fondation*").
- Bouton "Pas intéressé" pour dismiss (améliore le modèle).
- Page dédiée `/recommendations` avec la liste complète et filtres par raison.

---

## 17. Serveur MCP (Model Context Protocol)

### 17.1 Principe

Shelf expose un serveur MCP permettant aux utilisateurs de connecter leur bibliothèque à n'importe quel client IA compatible (Claude, Cursor, ChatGPT avec plugins, etc.). L'IA peut ainsi consulter la bibliothèque, chercher des livres, lire les annotations, obtenir des recommandations et gérer les étagères via des outils structurés.

### 17.2 Transport

| Transport | Usage |
|-----------|-------|
| **SSE (Server-Sent Events)** | Client distant via HTTP — transport par défaut |
| **Streamable HTTP** | Alternative moderne au SSE, support natif des sessions |

Le serveur MCP est exposé sur `/api/mcp` et requiert un token d'authentification (API key par utilisateur).

### 17.3 Authentification MCP

- Chaque utilisateur peut générer des **API keys** depuis ses paramètres (`/settings/api-keys`).
- Les API keys sont des tokens opaques (préfixe `sk_shelf_`, 48 caractères aléatoires).
- Hashées en base (SHA-256), jamais stockées en clair.
- Permissions : chaque key hérite du rôle de l'utilisateur (admin ou reader).
- Révocables individuellement.

Table `ApiKey` :

| Colonne | Type | Description |
|---------|------|-------------|
| id | UUID | PK |
| user_id | UUID | FK → User |
| name | VARCHAR(100) | Label choisi par l'utilisateur |
| key_hash | VARCHAR(64) | SHA-256 du token |
| key_prefix | VARCHAR(12) | `sk_shelf_xxxx` pour identification visuelle |
| last_used_at | TIMESTAMPTZ | Nullable |
| expires_at | TIMESTAMPTZ | Nullable |
| created_at | TIMESTAMPTZ | |
| revoked_at | TIMESTAMPTZ | Nullable |

### 17.4 Tools exposés

#### Lecture de la bibliothèque

| Tool | Description | Paramètres |
|------|-------------|------------|
| `search_books` | Recherche full-text dans la bibliothèque | `query: string`, `filters?: object`, `limit?: number` |
| `get_book` | Détail complet d'un livre | `book_id: string` |
| `list_books` | Liste paginée avec filtres | `page?: number`, `per_page?: number`, `sort?: string`, `filters?: object` |
| `get_book_content` | Extraire le texte d'un chapitre EPUB | `book_id: string`, `chapter?: number` |

#### Annotations et progression

| Tool | Description | Paramètres |
|------|-------------|------------|
| `get_annotations` | Annotations de l'utilisateur pour un livre | `book_id: string`, `type?: 'highlight' \| 'note' \| 'bookmark'` |
| `get_all_annotations` | Toutes les annotations de l'utilisateur | `limit?: number`, `offset?: number` |
| `get_reading_progress` | Progression de lecture | `book_id?: string` (tous si omis) |
| `create_annotation` | Créer une annotation | `book_id: string`, `type: string`, `content: string`, `note?: string` |

#### Étagères

| Tool | Description | Paramètres |
|------|-------------|------------|
| `list_shelves` | Étagères de l'utilisateur | — |
| `get_shelf_books` | Livres d'une étagère | `shelf_id: string` |
| `add_to_shelf` | Ajouter un livre à une étagère | `book_id: string`, `shelf_id: string` |
| `remove_from_shelf` | Retirer un livre | `book_id: string`, `shelf_id: string` |

#### Recommandations

| Tool | Description | Paramètres |
|------|-------------|------------|
| `get_recommendations` | Recommandations personnalisées | `limit?: number` |
| `dismiss_recommendation` | Ignorer une recommandation | `book_id: string` |

#### Administration (admin uniquement)

| Tool | Description | Paramètres |
|------|-------------|------------|
| `add_book` | Ajouter un livre (physique) | `title: string`, `authors: string[]`, `isbn?: string`, ... |
| `update_book` | Modifier les métadonnées | `book_id: string`, `fields: object` |
| `delete_book` | Soft delete | `book_id: string` |
| `scan_duplicates` | Lancer un scan de doublons | — |

### 17.5 Resources exposées

Les Resources MCP permettent à l'IA de consulter des données contextuelles :

| URI | Description |
|-----|-------------|
| `shelf://library/stats` | Statistiques de la bibliothèque (nombre de livres, formats, langues) |
| `shelf://user/reading-list` | Livres en cours de lecture |
| `shelf://user/favorites` | Liste des favoris |
| `shelf://user/recent-annotations` | 20 dernières annotations |
| `shelf://book/{id}/metadata` | Métadonnées complètes d'un livre |
| `shelf://book/{id}/annotations` | Annotations du livre |
| `shelf://shelves` | Liste des étagères avec nombre de livres |

### 17.6 Prompts pré-définis

Le serveur expose des prompts MCP que les clients IA peuvent proposer :

| Prompt | Description |
|--------|-------------|
| `summarize_book` | "Résume ce livre en se basant sur mes annotations et highlights" |
| `reading_insights` | "Analyse mes habitudes de lecture et donne des insights" |
| `find_similar` | "Trouve des livres similaires à [titre] dans ma bibliothèque" |
| `shelf_curator` | "Suggère une organisation de mes étagères basée sur mon historique" |
| `quote_finder` | "Retrouve des passages que j'ai annotés sur le thème [sujet]" |

### 17.7 Configuration côté client

L'utilisateur configure son client IA avec :

```json
{
  "mcpServers": {
    "shelf": {
      "url": "https://my-shelf-instance.com/api/mcp",
      "headers": {
        "Authorization": "Bearer sk_shelf_xxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

### 17.8 Implémentation technique

- Basé sur le SDK officiel `@modelcontextprotocol/sdk`.
- Intégré comme API Route Next.js (`/api/mcp`).
- Rate limiting : 60 requêtes/minute par API key.
- Logging des appels MCP pour audit.
- `get_book_content` : extraction du texte par chapitre avec limite de tokens pour éviter de surcharger le contexte de l'IA.

---

## 18. Tests

| Type | Outil | Couverture |
|------|-------|------------|
| Unit | Vitest | Logique métier, metadata parsing, merge algorithm, recommendation scoring |
| Integration | Vitest + Prisma (test DB) | API routes, Server Actions, MCP tools |
| E2E | Playwright | Flux critiques : auth, upload, lecture, recherche, recommendations |
| Component | Vitest + Testing Library | Composants UI isolés |

---

## 19. Glossaire

| Terme | Définition |
|-------|------------|
| CFI | Canonical Fragment Identifier — standard EPUB pour identifier une position dans un livre |
| Three-way merge | Algorithme de fusion comparant trois versions d'une donnée (fichier, base, snapshot) |
| Storage adapter | Abstraction permettant de switcher entre stockage local et S3 |
| Dynamic shelf | Étagère dont le contenu est calculé automatiquement via des règles de filtrage |
| Soft delete | Suppression logique (marquage `deleted_at`) sans suppression physique des données |
| Content hash | SHA-256 du contenu d'un fichier, utilisé pour la déduplication et le matching |
| OPF | Open Packaging Format — fichier XML de métadonnées dans un EPUB |
| MCP | Model Context Protocol — protocole ouvert permettant aux clients IA d'interagir avec des services externes via tools, resources et prompts |
| Content-based filtering | Recommandation basée sur la similarité des attributs des items (auteurs, sujets, tags) |
| Collaborative filtering | Recommandation basée sur les comportements d'utilisateurs similaires |
| API key | Token d'authentification opaque permettant l'accès programmatique à l'API et au serveur MCP |
| Cold start | Problème des systèmes de recommandation quand un utilisateur n'a pas encore assez d'historique |
