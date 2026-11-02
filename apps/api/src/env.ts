export interface Env {
  ENVIRONMENT: 'development' | 'production';
  AUTH_MODE?: 'dev';
  STORE?: 'memory' | 'supabase';
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  CONNECTIONS_KEY: string;
  APP_ORIGIN: string;
  SITE_ORIGIN: string;
  ADMIN_EMAILS: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_BUILDER?: string;
  STRIPE_PRICE_TEAM?: string;
  STRIPE_PRICE_AGENCY?: string;
  STRIPE_PRICE_BUSINESS?: string;
  /** Prix à l'usage rattachés aux compteurs (ajoutés au paiement). */
  STRIPE_PRICE_OVERAGE?: string;
  STRIPE_PRICE_ACTIVE_CLIENT?: string;
  /** Noms d'événements des compteurs Stripe (Billing → Meters). */
  STRIPE_METER_OVERAGE?: string;
  STRIPE_METER_ACTIVE_CLIENT?: string;
  WEBAUTHN_RP_ID: string;
  WEBAUTHN_ORIGIN: string;
  API_ORIGIN?: string;
}

export const TEST_ENV: Env = {
  ENVIRONMENT: 'development',
  AUTH_MODE: 'dev',
  STORE: 'memory',
  SUPABASE_URL: '',
  SUPABASE_SERVICE_ROLE_KEY: '',
  CONNECTIONS_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  APP_ORIGIN: 'http://localhost:5173',
  SITE_ORIGIN: 'http://localhost:4321',
  ADMIN_EMAILS: 'admin@exemple.fr',
  EMAIL_FROM: 'Artemis <dev@localhost>',
  VAPID_SUBJECT: 'mailto:dev@localhost',
  WEBAUTHN_RP_ID: 'localhost',
  WEBAUTHN_ORIGIN: 'http://localhost:5173',
};
