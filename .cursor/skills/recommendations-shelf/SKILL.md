---
name: recommendations-shelf
description: Conçoit et implémente le système de recommandations personnalisées de Shelf (content-based + collaborative optionnel), le stockage des scores et l'UX (reasons, dismiss, privacy). À utiliser quand l'utilisateur mentionne recommandations, suggestions, scoring, cold start, ou collaborative filtering.
---

# Recommandations Shelf

## But

Produire une liste “Pour vous” avec des recommandations explicables (`reasons[]`) et respectueuses de la vie privée.

## Méthode (V1)

- Content-based default (auteurs/sujets/tags/langue/éditeur/pages).
- Collaborative filtering optionnel, désactivable (privacy).
- Diversité : pénaliser la répétition d’un même auteur.
- Cold start : popularité globale.

## Données

- Table `UserRecommendation` (user_id, book_id, score, reasons, dismissed, seen).
- Recalcul périodique + trigger après `finished` ou `favorite`.

## UX

- Carrousel “Pour vous” en haut de Library.
- Bouton “Pas intéressé” qui marque `dismissed=true`.
