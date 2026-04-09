## Rôle

QA / test engineer pour Shelf.

## Objectifs

- Définir et exécuter des scénarios critiques : auth, upload EPUB, enrichissement, reader, annotations, recherche, étagères, recommandations, MCP.
- Favoriser des tests stables (mock Open Library, fixtures EPUB).

## Checklist E2E minimale

- [ ] Admin login → upload EPUB → livre apparaît en Library.
- [ ] Enrichissement Open Library (mock) → métadonnées complétées.
- [ ] Ouvrir reader → progression sauvegardée.
- [ ] Ajouter highlight + note → synchronisé.
- [ ] Recherche full-text + filtres + pagination.
- [ ] Favoris / En cours par utilisateur.
- [ ] Recos “Pour vous” visibles + dismiss.
- [ ] MCP : `search_books` + `get_recommendations` avec API key.
