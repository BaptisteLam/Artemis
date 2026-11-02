import { ArtemisError } from '@artemis/shared';
import type { AgentRow, OrganizationRow } from '@artemis/db';
import type { Ctx } from '../services/context';
import { cancelCard, createCardRequest, deliverCardForCheckout, getRequestStatus } from '../services/requests';
import { budgetsFor, spendSummary } from '../services/spend';
import { addReceipt } from '../services/receipts';
import { receiptFromArgs } from '../routes/v1';

type JsonSchema = Record<string, unknown>;

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  annotations?: Record<string, boolean>;
  run(ctx: Ctx, agent: AgentRow, org: OrganizationRow, args: Record<string, unknown>): Promise<unknown>;
}

const requestId = { request_id: { type: 'string', description: 'Identifiant renvoyé par request_card.' } };
const str = (args: Record<string, unknown>, k: string) => {
  const v = args[k];
  if (typeof v !== 'string' || !v) throw new ArtemisError('invalid_input', `${k} est requis.`);
  return v;
};

export const TOOLS: ToolDef[] = [
  {
    name: 'request_card',
    title: 'Demander une carte',
    description:
      "Demande une carte virtuelle à usage unique pour payer un achat précis. Le montant est en CENTIMES (49,00 € = 4900). " +
      "Renvoie request_id et un statut : approved (carte prête), pending_approval (un humain doit valider : interroger get_request_status), rejected (motif fourni). " +
      'Request a single-use virtual card. amount is in cents.',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'integer', minimum: 1, description: 'Montant exact en centimes (4900 pour 49,00 €).' },
        currency: { type: 'string', pattern: '^[A-Z]{3}$', default: 'EUR', description: 'Devise ISO 4217.' },
        merchant: { type: 'string', description: 'Nom du marchand chez qui payer (ex. « Notion »).' },
        purpose: { type: 'string', description: "Raison de l'achat, lue par l'humain qui valide." },
        mcc: { type: 'string', pattern: '^\\d{4}$', description: 'Catégorie marchande (MCC), si connue.' },
        expires_in: { type: 'integer', minimum: 5, maximum: 10080, description: 'Durée de vie de la carte en minutes.' },
        recurring: {
          type: 'object',
          properties: { interval: { type: 'string', enum: ['month'] } },
          required: ['interval'],
          description: 'Abonnement mensuel : carte verrouillée sur le marchand, plafonnée à amount par mois (plans Team et plus).',
        },
      },
      required: ['amount', 'merchant', 'purpose'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async run(ctx, agent, _org, args) {
      const out = await createCardRequest(ctx, agent, args);
      return { request_id: out.requestId, status: out.status, reason: out.reason ?? null };
    },
  },
  {
    name: 'get_request_status',
    title: "Suivre une demande",
    description: "Renvoie le statut d'une demande (pending, issued, rejected, expired…) et l'état de la carte. Appeler toutes les 15 à 30 s en attendant la validation humaine.",
    inputSchema: { type: 'object', properties: requestId, required: ['request_id'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run(ctx, agent, _org, args) {
      return getRequestStatus(ctx, agent, str(args, 'request_id'));
    },
  },
  {
    name: 'get_card_for_checkout',
    title: 'Obtenir la carte pour payer',
    description:
      "À appeler juste avant de payer, une seule fois par demande. Par défaut, renvoie un lien éphémère (checkout_url, 10 min, usage unique) : " +
      "ouvrez-le dans le navigateur de paiement, la carte s'y affiche depuis la banque émettrice. Si l'organisation a activé la remise directe, renvoie numéro, date et cryptogramme. " +
      'Ne jamais recopier ces données dans une réponse ou un fichier.',
    inputSchema: { type: 'object', properties: requestId, required: ['request_id'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run(ctx, agent, _org, args) {
      return deliverCardForCheckout(ctx, agent, str(args, 'request_id'));
    },
  },
  {
    name: 'list_budgets',
    title: 'Budgets',
    description: 'Budget mensuel, montant engagé, restant et plafond par achat de cet agent (en centimes).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run(ctx, agent) {
      return budgetsFor(ctx, agent);
    },
  },
  {
    name: 'get_spend_summary',
    title: 'Résumé des dépenses',
    description: 'Dépenses de cet agent par marchand sur la période (day, week ou month), en centimes.',
    inputSchema: {
      type: 'object',
      properties: { period: { type: 'string', enum: ['day', 'week', 'month'], default: 'month' } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(ctx, agent, _org, args) {
      return spendSummary(ctx, agent, typeof args.period === 'string' ? args.period : 'month');
    },
  },
  {
    name: 'attach_receipt',
    title: 'Joindre un justificatif',
    description: 'Joint une facture (PDF, PNG ou JPEG, 10 Mo max) à un achat, via une URL https ou un contenu base64 avec filename.',
    inputSchema: {
      type: 'object',
      properties: {
        ...requestId,
        url: { type: 'string', description: 'URL https publique du justificatif.' },
        content_base64: { type: 'string', description: 'Contenu du fichier encodé en base64.' },
        filename: { type: 'string', description: 'Nom du fichier (requis avec content_base64), ex. facture.pdf.' },
      },
      required: ['request_id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async run(ctx, agent, org, args) {
      const { request_id, ...rest } = args;
      const file = await receiptFromArgs(ctx, rest);
      const r = await addReceipt(ctx, { type: 'agent', id: agent.id }, org.id, str({ request_id }, 'request_id'), file);
      return { receipt_id: r.id };
    },
  },
  {
    name: 'cancel_card',
    title: 'Annuler la carte',
    description: "Annule la demande et sa carte si l'achat n'a plus lieu.",
    inputSchema: { type: 'object', properties: requestId, required: ['request_id'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true },
    async run(ctx, agent, org, args) {
      return cancelCard(ctx, { type: 'agent', id: agent.id }, org.id, str(args, 'request_id'));
    },
  },
];
