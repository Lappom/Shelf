# /implement — Implémenter des phases de `roadmap.md`

Implémente **de façon optimisée** une ou plusieurs phases / sous-phases de `roadmap.md` (et donc de `docs/SPECS.md`) : code + DB + UI + tests + durcissement sécurité/perf, avec un résultat merge-ready.

---

## Entrée attendue (dans ton message après `/implement`)

Colle **au minimum** :

- Les identifiants des phases/sous-phases, par exemple :
  - `Phase 4`
  - `Phase 4.1–4.7`
  - `Phase 12.1 + Phase 12.5`
  - `Phase 22 (MCP)`
- Le périmètre (optionnel mais recommandé) :
  - `MVP` (strict minimum), `Complet`, ou `Complet + tests E2E`

Exemples :

- `/implement Phase 4.1–4.7 (Complet)`  
- `/implement Phase 12.1 + 12.3 + 12.5 (MVP)`  
- `/implement Phase 22.1–22.8 (Complet + tests)`  

Si l’utilisateur ne précise pas de phase, **demande une précision** (liste courte d’options : Phase X, X.Y, ou intervalle).

---

## Contraintes globales (à respecter strictement)

- Répondre en **français**, style **concis**.
- Tous les commentaires de code doivent être en **anglais**.
- Tout ce qui touche à **auth, upload, storage, reader, MCP** est **security-critical** : faire les checks d’accès, valider les inputs côté serveur, éviter les fuites de fichiers.
- Ne **pas inventer** d’endpoints/tools/resources/prompts qui ne figurent pas dans `docs/SPECS.md` (si tu dois en ajouter, mets à jour la spec d’abord).
- Ne jamais servir un fichier du storage directement : uniquement via endpoint authentifié + checks d’accès.
- Préférer des solutions simples, testables, et Postgres natif (tsvector / trigram) avant d’ajouter une infra externe.

---

## Procédure d’implémentation (optimisée)

### 1) Préparation (lecture & extraction)

- Lire `roadmap.md` et extraire uniquement les items correspondant aux phases demandées.
- Lire dans `docs/SPECS.md` les sections associées (et les contraintes transverses : Sécurité §14, Performance §15, Tests §18, Config §13).
- Établir une **checklist d’acceptation** ultra concrète (5–15 bullets) avant de coder.

### 2) Design minimal (sans sur-architecture)

- Définir brièvement :
  - données touchées (tables Prisma + indexes)
  - routes/pages concernées (App Router)
  - API Routes vs Server Actions
  - validations serveur (schémas)
  - contraintes sécurité (RBAC, streaming, sanitization, rate limit)

### 3) Implémentation

Implémenter en priorisant :

1. **DB + migrations + indexes**
2. **backend** (Server Actions / API Routes)
3. **UI**
4. **tests** (au moins unit/integration selon la phase)
5. **perf & security hardening**

Bonnes pratiques attendues :

- Utiliser `tsvector` + `websearch_to_tsquery`/`plainto_tsquery` si la phase touche la recherche.
- Utiliser `pg_trgm` si la phase touche le fuzzy (et activer l’extension).
- Si streaming EPUB : stream (pas de buffer complet) et checks d’accès.
- Pour le reader : sanitization du contenu rendu.

### 4) Vérifications

- Lancer les diagnostics/lints sur les fichiers modifiés.
- Vérifier les cas limites évidents (permissions, inputs invalides, fichiers manquants, soft-delete restore si applicable).
- Si la phase est security-critical, ajouter une mini “security checklist” (3–8 points) et vérifier que c’est couvert.

### 5) Résultat attendu (sortie)

Dans la réponse finale :

- Résumer ce qui est implémenté (3–8 bullets).
- Lister les fichiers modifiés/ajoutés (liste courte).
- Donner un “test plan” (commandes + scénarios).
- Si des morceaux restent non couverts (parce que hors périmètre demandé), les pointer explicitement.

---

## Heuristiques “phase → profil” (guidage)

- Si la phase touche **MCP** : appliquer le profil “MCP” (auth API keys, tools/resources/prompts, audit, rate limit).
- Si la phase touche **EPUB/OPF/three-way merge/writeback** : appliquer le profil “EPUB”.
- Si la phase touche **Recommandations** : appliquer le profil “Recommendations” + focus DB/perf.
- Si la phase touche **UI / shadcn / responsive / PWA** : appliquer le profil “Frontend design”.
- Si la phase touche **Prisma/Postgres/FTS/index/perf** : appliquer le profil “Backend”.

