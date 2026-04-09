# Configuration client MCP (Shelf)

## URL

- Endpoint : `{ORIGIN}/api/mcp` (ex. `https://votre-domaine.com/api/mcp`).
- Authentification : en-tête `Authorization: Bearer sk_shelf_…` (clé créée dans `/settings/api-keys`).

## Exemple JSON (Claude / clients compatibles)

```json
{
  "mcpServers": {
    "shelf": {
      "url": "https://my-shelf-instance.com/api/mcp",
      "headers": {
        "Authorization": "Bearer sk_shelf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

Remplacez l’URL par l’origine publique de votre instance et le token par une clé valide.

## Transports

Le serveur utilise le transport **Streamable HTTP** du SDK MCP (requêtes `GET` / `POST` / `DELETE` sur la même URL), avec **mode sans session** pour compatibilité serverless. Les clients récents MCP peuvent s’y connecter directement ; un client historique basé uniquement sur l’ancien SSE peut nécessiter une mise à jour.

## Rate limiting

- 60 requêtes par minute par clé API (réponse HTTP `429` si dépassement).

## Rotation et révocation des clés

1. Créer une nouvelle clé nommée dans **Paramètres → Clés API / MCP** (`/settings/api-keys`).
2. Mettre à jour la configuration du client IA avec le nouveau secret (la valeur complète n’est affichée qu’une fois).
3. Révoquer l’ancienne clé depuis la même page.
4. Ne jamais committer de clé dans un dépôt ; utiliser des variables d’environnement ou le gestionnaire de secrets du client.

## Dépannage

- **401** : token manquant, préfixe incorrect, clé révoquée ou expirée.
- **429** : trop de requêtes ; attendre la fenêtre d’une minute ou répartir la charge.
