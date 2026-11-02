export type PolicyRejectCode =
  | 'currency_not_allowed'
  | 'invalid_amount'
  | 'over_transaction_limit'
  | 'over_monthly_budget'
  | 'merchant_blocked'
  | 'merchant_not_allowed'
  | 'mcc_blocked'
  | 'mcc_not_allowed';

export type ErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'invalid_input'
  | 'rate_limited'
  | 'quota_exceeded'
  | 'subscription_inactive'
  | 'org_frozen'
  | 'agent_frozen'
  | 'request_not_pending'
  | 'request_expired'
  | 'already_revealed'
  | 'card_not_ready'
  | 'bank_error'
  | 'plan_limit'
  | 'over_client_budget'
  | 'internal'
  | PolicyRejectCode;

export function httpStatusFor(code: ErrorCode): number {
  switch (code) {
    case 'unauthorized':
      return 401;
    case 'forbidden':
    case 'org_frozen':
    case 'agent_frozen':
    case 'plan_limit':
    case 'subscription_inactive':
      return 403;
    case 'not_found':
      return 404;
    case 'rate_limited':
    case 'quota_exceeded':
      return 429;
    case 'bank_error':
      return 502;
    case 'internal':
      return 500;
    case 'request_not_pending':
    case 'request_expired':
    case 'already_revealed':
    case 'card_not_ready':
      return 409;
    default:
      return 400;
  }
}

export class ArtemisError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'ArtemisError';
    this.code = code;
    this.status = httpStatusFor(code);
  }
  toJSON() {
    return { error: { code: this.code, message: this.message } };
  }
}
