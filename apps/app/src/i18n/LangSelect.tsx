import { LOCALES, LOCALE_NAMES, isLocale } from '@artemis/i18n';
import { useI18n } from './index';

/** Sélecteur de langue (24 langues de l'UE). Le choix est mémorisé sur l'appareil. */
export function LangSelect({ className = 'org-select' }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <select className={className} aria-label={t('lang.choose')} title={t('lang.choose')} value={locale} onChange={(e) => isLocale(e.target.value) && void setLocale(e.target.value)}>
      {LOCALES.map((l) => (
        <option key={l} value={l} lang={l}>
          {LOCALE_NAMES[l]}
        </option>
      ))}
    </select>
  );
}
