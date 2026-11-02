// Catalogues de l'API (emails, push, Slack). Fichier régénéré par scripts/i18n-api-catalogs.mjs : ne pas éditer à la main.
import type { Locale, Messages } from '@artemis/i18n';
import en from './messages/en/notify.json';
import fr from './messages/fr/notify.json';

export const CATALOGS: Partial<Record<Locale, Messages>> = { en, fr };
