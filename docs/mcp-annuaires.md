# Fiche pour les annuaires MCP

**Nom** : Artemis
**Résumé (FR)** : Cartes virtuelles à usage unique pour vos agents IA, créées dans votre propre banque (Qonto, Revolut Business, Stripe Issuing) et validées par passkey. Budgets, règles par agent, journal d'audit AI Act, exports Pennylane.
**Summary (EN)** : Single-use virtual cards for your AI agents, issued in your own business bank and approved with a passkey. Per-agent budgets and rules, audit trail, accounting exports. Europe, EUR.
**Transport** : HTTP streamable, `POST https://<worker>/mcp`
**Authentification** : en-tête `Authorization: Bearer art_…` (jeton par agent, créé dans l'app)
**Outils** : `request_card`, `get_request_status`, `get_card_for_checkout`, `list_budgets`, `get_spend_summary`, `attach_receipt`, `cancel_card`
**Catégories** : finance, payments, spend management
**Liens** : site, docs (`/docs/mcp-claude`), conditions, confidentialité

Annuaires visés : registre MCP officiel, PulseMCP, Glama, mcpmarket, annuaire des connecteurs Claude.
