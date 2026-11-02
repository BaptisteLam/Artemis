import type { ReactElement } from 'react';
import { I18nProvider } from '../i18n';

/** Enveloppe un composant pour les tests (langue : anglais). */
export const withI18n = (ui: ReactElement) => <I18nProvider>{ui}</I18nProvider>;
