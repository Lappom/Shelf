# State client (Zustand)

## Pourquoi Zustand

- Store léger et explicite (idéal pour **reader + préférences**).
- Évite le prop-drilling, reste simple à tester (fonctions pures + sélecteurs).
- Découple l’UI des détails de persistance (DB / API / storage).

## Règles d’usage

- **Local state (React)** : état purement UI et éphémère (ex: ouverture d’un dialog, tab active, hover).
- **Zustand store** : état transverse au reader / app shell (ex: préférences reader, dernière position affichée, flags UI cross-pages).
- **Server state** : données venant de la DB/API (progression, annotations) — à charger côté serveur (RSC/Server Actions) ou via fetch, puis hydrater côté client si nécessaire.

## Convention de placement

- Stores sous `src/lib/**` (ex: `src/lib/reader/store.ts`) ou `src/hooks/**` si le store est strictement lié à un hook.
  L’objectif est d’éviter un dossier “store” global fourre-tout.
