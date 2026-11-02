import { DEFAULT_LOCALE, type Locale } from '@artemis/i18n';

/** Langue utilisée par les composants (montants). L'app la règle à chaque changement de langue. */
let current: Locale = DEFAULT_LOCALE;
export const setUiLocale = (l: Locale) => {
  current = l;
};
export const getUiLocale = () => current;
