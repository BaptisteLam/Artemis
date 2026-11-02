# Règles du projet Artemis

## Langues : tout doit être traduisible (règle obligatoire, vérifiée en CI)

Le site et l'app sont **nativement en anglais** et disponibles dans les **24 langues officielles de l'UE**
(`packages/i18n/src/locales.ts`). La langue est détectée automatiquement (choix mémorisé > langue du
navigateur > pays) et modifiable à tout moment via le sélecteur.

Pour **tout** ajout ou modification (page, article de blog, fonctionnalité, composant, bouton, message
d'erreur, email, texte alternatif, `title`, `aria-label`, `placeholder`…) :

1. **Aucun texte visible écrit en dur.** Passer par une clé de traduction :
   - site (Astro) : `const { t, href, money, date } = i18n(Astro.url);` puis `{t('espace.cle')}` ;
     texte riche (gras, liens, code) : `<Fragment set:html={t('cle', { href })} />` ;
   - app (React) : `const { t, money, date } = useI18n();` ; hors composant : `t()` de `src/i18n`.
2. **Ajouter la clé dans les 24 langues dans le même commit** :
   - site : `apps/site/src/i18n/messages/<langue>/<espace>.json` ;
   - app : `apps/app/src/i18n/messages/<langue>/<espace>.json`.
   L'anglais (`en`) est la source. Mêmes variables `{nom}`, mêmes balises HTML. Pluriels : `cle_one`,
   `cle_other` + les formes exigées par la langue (`_few`, `_many`, `_two`…, règles CLDR).
3. **Montants, nombres et dates** : toujours `money()`, `number()`, `date()` (format de la langue).
4. **Nouvelle page du site** : dans `apps/site/src/pages/[...lang]/` avec
   `export function getStaticPaths() { return localeStaticPaths(); }` ; liens internes via `href('/chemin')`.
   Adresses en anglais (`/pricing`, pas `/tarifs`).
5. **Blog / articles** : un fichier par langue, même nom dans les 24 dossiers :
   `apps/site/src/content/blog/<langue>/<slug>.md`.
6. **Textes juridiques** (CGV, confidentialité, mentions légales) : traduits, avec la mention que seule la
   **version française fait foi**.
7. Exceptions autorisées : contenu de `<code>`/`<pre>`, noms de marque (liste `BRAND_WORDS` de
   `packages/i18n/src/lint.ts`), attribut `data-i18n-ignore`, commentaire `// i18n-ignore` **réservé aux
   messages destinés aux développeurs**.

Vérification locale : `pnpm --filter site test` et `pnpm --filter app test` (tests `i18n`).
Pendant un travail en cours seulement : `I18N_LOCALES=en,fr` limite la vérification des traductions.

## Autres règles

- Données personnelles et secrets : jamais dans le code (secrets GitHub / Cloudflare).
- Le numéro complet d'une carte ne doit jamais être stocké ni journalisé.
- Commits en français ; tests verts (`pnpm typecheck && pnpm test`) avant chaque push.
