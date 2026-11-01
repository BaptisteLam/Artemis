# Benchmark et étude critique (novembre 2026) — synthèse

Source : étude fournie par Baptiste le 1er novembre 2026. Ce résumé guide la V2.

## Conclusions
- **Besoin réel mais créneau étroit.** Ramp (mars 2026), Stripe Issuing for agents (avril 2026, aperçu privé), Mercury Agent Cards (août 2026), Visa en Europe (juillet 2026, plus de 30 émetteurs) : la carte pour agent devient une commodité. Reste à prendre en Europe une couche **neutre multi-banques** : approbation signée, preuve AI Act, compta française, multi-clients pour les agences.
- **Qonto ne transmet pas la carte** : PAN/CVV seulement dans une iframe Qonto, au titulaire, sans réglage partenaire. Le contrat interdit de prêter la carte. Qonto = lecture, gel, rapprochement, justificatifs.
- **Revolut** : PAN lisible par API (`READ_SENSITIVE_CARD_DATA`, liste blanche IP, plan Grow+, Cards API sur demande), mais tout usage « services financiers » exige un **accord écrit** (Valid Permission).
- **Stripe Issuing** : meilleur rail (usage unique, autorisation temps réel, clés éphémères, jetons agentiques) et principal concurrent. Plafonds par défaut faibles (25 cartes/semaine, 5 000 $/semaine).
- **PCI DSS** : faire transiter le PAN par Artemis le fait entrer dans le périmètre. Parade : ne jamais le faire transiter (Issuing Elements, jetons, coffre tiers).
- **Demande européenne** : agences et freelances d'automatisation, startups IA 5–50 personnes, DAF de scale-ups régulées. 20 % des entreprises européennes de 10+ salariés utilisent l'IA en 2025 (Eurostat).

## Ordre des rails
Sandbox → Stripe Issuing → Revolut (accord écrit) → Qonto (lecture/gel) → Airwallex.

## Concurrents et idées importées
| Acteur | À importer |
|---|---|
| Stripe Issuing for agents | Litige auto en cas d'écart ; pas de PAN (clés éphémères, SPT) |
| Ramp Agent Cards | Onboarding en une commande CLI |
| Mercury Agent Cards | Gel auto si justificatif manquant ; limites non modifiables par l'agent |
| Privacy.com | Connecteur Claude officiel ; cartes verrouillées au marchand |
| AgentCard | Extension navigateur |
| Skyfire (KYA) | Identité d'agent signée dans le mandat |
| Payhawk / Pleo / Spendesk | Récupération automatique des factures |

## Positionnement
« Le pare-feu financier et la preuve AI Act de vos agents, sur la banque de votre choix. » Segment de départ : agences d'automatisation francophones, puis startups IA.

## Tarifs retenus
Sandbox 0 € · Builder 29 € · Team 99 € · Agences 249 € + 15 €/client actif · Business dès 690 € · dépassement 0,25 €/mandat.

## Risques
Interdiction contractuelle de prêter la carte (critique) · PCI DSS · responsabilité en cas d'achat erroné · banques qui intègrent la fonction · dépendance à un partenaire · marque « Artemis ». Micro-entreprise : plafond services 83 600 € (2026-2028), franchise TVA 37 500 € ; **SASU au premier contrat bancaire ou à 1 500 € de MRR**.

## Plan 90 jours (côté fondateur)
1. Écrire à Revolut (api-requests@revolut.com) et au partenariat Qonto. 2. Stripe Issuing en production (dogfooding) puis demande Issuing for agents. 3. Note PCI avec un QSA. 4. Recherche d'antériorité de marque. 5. 30 entretiens agences/startups, 10 pilotes à -50 %. 6. Contenus : guide AI Act, démo d'injection bloquée. 7. Partenariats : Qonto Marketplace, expert-comptable, annuaire de connecteurs Claude.
