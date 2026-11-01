import { z } from 'zod';
import { ArtemisError } from './errors';

export const MAX_AMOUNT_CENTS = 100_000_000;

export const RequestCardInputSchema = z.object({
  amount: z.number().int().min(1).max(MAX_AMOUNT_CENTS),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default('EUR'),
  merchant: z.string().trim().min(1).max(120),
  purpose: z.string().trim().min(1).max(500),
  mcc: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  expires_in: z.number().int().min(5).max(10080).optional(),
});

export type RequestCardInput = z.infer<typeof RequestCardInputSchema>;

const CENTS_HINT =
  'amount doit être un entier positif en centimes : 49,00 € = 4900 (amount must be an integer in cents)';

export function parseRequestCardInput(raw: unknown): RequestCardInput {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const amount = obj.amount;
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT_CENTS) {
    throw new ArtemisError('invalid_amount', CENTS_HINT);
  }
  const parsed = RequestCardInputSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ArtemisError('invalid_input', `${issue?.path.join('.') || 'input'}: ${issue?.message ?? 'invalide'}`);
  }
  return parsed.data;
}

/** Valide un objet avec un schéma Zod et lève invalid_input sinon. */
export function parseWith<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ArtemisError('invalid_input', `${issue?.path.join('.') || 'input'}: ${issue?.message ?? 'invalide'}`);
  }
  return parsed.data;
}
