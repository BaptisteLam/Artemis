/**
 * Détecte le texte visible écrit « en dur » (non traduisible) dans les fichiers .astro et .tsx.
 * Utilisé par les tests du site et de l'app : tout texte affiché doit passer par `t('clé')`.
 *
 * Exceptions autorisées :
 * - contenu de <code>, <pre>, <script>, <style>, <svg> ;
 * - noms propres et sigles techniques (liste BRAND_WORDS) ;
 * - élément portant l'attribut `data-i18n-ignore` ;
 * - ligne de code contenant le commentaire `i18n-ignore`.
 */
import { parse } from '@astrojs/compiler';
import ts from 'typescript';

export const BRAND_WORDS = [
  'Artemis', 'Claude', 'Code', 'Desktop', 'ChatGPT', 'OpenAI', 'Anthropic', 'n8n', 'MCP', 'API', 'REST', 'CLI', 'SDK', 'Stripe', 'Issuing',
  'Qonto', 'Revolut', 'Business', 'Sandbox', 'Builder', 'Team', 'Slack', 'Pennylane', 'FEC', 'AI', 'Act', 'SEPA', 'PAN', 'CVC', 'CVV',
  'JSON', 'CSV', 'PDF', 'URL', 'HTTP', 'HTTPS', 'OAuth', 'IBAN', 'BIC', 'EUR', 'PSD2', 'PCI', 'DSS', 'RGPD', 'GDPR', 'WebAuthn', 'passkey',
  'Passkey', 'Face', 'ID', 'Touch', 'Supabase', 'Cloudflare', 'GitHub', 'npm', 'npx', 'Node', 'TOTP', 'SMS', 'MCC', 'SIRET', 'TVA', 'VAT',
  'Ramp', 'Mercury', 'Brex', 'Visa', 'Mastercard', 'Zapier', 'Make', 'Cursor', 'Windsurf', 'Gmail', 'Google', 'Apple', 'Microsoft', 'Linux',
  'macOS', 'Windows', 'iOS', 'Android', 'OK', 'ok', 'UTC', 'Bearer', 'webhook', 'Webhook', 'ID', 'UUID', 'HMAC', 'SHA', 'AES', 'GCM',
];

export interface Finding {
  line: number;
  text: string;
}

const brand = new Set(BRAND_WORDS);
const SKIP_ELEMENTS = new Set(['code', 'pre', 'script', 'style', 'svg', 'path', 'kbd', 'samp']);
const TEXT_ATTRS = new Set(['alt', 'title', 'aria-label', 'placeholder', 'label', 'aria-description', 'ariaLabel']);

/** Vrai si le texte contient des mots qui devraient être traduits. */
export function isTranslatableText(text: string): boolean {
  const words = text.match(/[\p{L}][\p{L}'’\-]*/gu) ?? [];
  return words.some((w) => {
    const bare = w.replace(/['’\-]+$/, '');
    if (brand.has(bare)) return false;
    if (/^[A-Z0-9_]+$/.test(bare) && bare.length <= 5) return false; // sigles courts
    return bare.length >= 2 || /[^\x00-\x7f]/.test(bare);
  });
}

/** Chaîne JS ressemblant à du texte destiné à l'utilisateur (et non à une classe CSS, un chemin, une clé…). */
export function looksLikeProse(s: string): boolean {
  const v = s.trim();
  if (!v || !/\s/.test(v)) return /[^\x00-\x7f]/.test(v) && /\p{L}{3,}/u.test(v) && !/^[\w.\-/:]+$/.test(v);
  if (/^[a-z0-9_\-:\[\]\/.#&>=()'"\s%,]+$/.test(v) && !/[A-Z]/.test(v) && !/\b(the|and|your|with|for|des|les|une|pour|avec|vos)\b/.test(v)) return false; // classes, sélecteurs
  if (/^(\/|\.\/|https?:|mailto:|#|--|@)/.test(v)) return false;
  if (/^[A-Z_]+(\s[A-Z_]+)*$/.test(v)) return false;
  if (/^[\w.]+\(/.test(v) || /=>|;\s*$|\{\s*$/.test(v)) return false; // code
  return isTranslatableText(v) && /\p{L}{2,}\s+\p{L}{2,}/u.test(v);
}

const lineOf = (source: string, offset: number) => source.slice(0, offset).split('\n').length;

/** Fichier .astro : nœuds texte, attributs textuels et chaînes du frontmatter. */
export async function lintAstro(source: string): Promise<Finding[]> {
  const out: Finding[] = [];
  const { ast } = await parse(source, { position: true });
  type Node = { type: string; name?: string; value?: string; children?: Node[]; attributes?: { name: string; value: string; kind: string }[]; position?: { start: { offset: number } } };
  const walk = (node: Node, skip: boolean, parentType = '') => {
    const ignored = node.attributes?.some((a) => a.name === 'data-i18n-ignore');
    const here = skip || ignored || (node.type === 'element' && SKIP_ELEMENTS.has(node.name ?? ''));
    if (node.type === 'frontmatter' && node.value) {
      const offset = node.position?.start.offset ?? 0;
      for (const f of lintScript(node.value, 'x.ts', false)) out.push({ line: f.line + lineOf(source, offset) - 1, text: f.text });
    }
    // Le texte direct d'une expression {…} est du code, pas du contenu.
    if (!here && node.type === 'text' && parentType !== 'expression' && node.value && isTranslatableText(node.value)) {
      out.push({ line: lineOf(source, node.position?.start.offset ?? 0), text: node.value.trim().slice(0, 80) });
    }
    if (!here) {
      for (const a of node.attributes ?? []) {
        if (a.kind === 'quoted' && TEXT_ATTRS.has(a.name) && isTranslatableText(a.value)) {
          out.push({ line: lineOf(source, node.position?.start.offset ?? 0), text: `${a.name}="${a.value.slice(0, 60)}"` });
        }
      }
    }
    for (const c of node.children ?? []) walk(c, here, node.type);
  };
  walk(ast as unknown as Node, false);
  return out;
}

/** Fichier .ts/.tsx : texte JSX, attributs textuels, chaînes ressemblant à du texte. */
export function lintScript(source: string, fileName = 'x.tsx', jsx = true): Finding[] {
  const out: Finding[] = [];
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, jsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lines = source.split('\n');
  const ignoredLine = (pos: number) => {
    const l = sf.getLineAndCharacterOfPosition(pos).line;
    return /i18n-ignore/.test(lines[l] ?? '') || /i18n-ignore/.test(lines[l - 1] ?? '');
  };
  const push = (node: ts.Node, text: string) => {
    if (ignoredLine(node.getStart(sf))) return;
    out.push({ line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, text: text.trim().slice(0, 80) });
  };
  const elementName = (n: ts.Node): string | null => {
    if (ts.isJsxElement(n)) return n.openingElement.tagName.getText(sf);
    if (ts.isJsxSelfClosingElement(n)) return n.tagName.getText(sf);
    return null;
  };
  const hasIgnoreAttr = (n: ts.Node) => {
    const attrs = ts.isJsxElement(n) ? n.openingElement.attributes : ts.isJsxSelfClosingElement(n) ? n.attributes : null;
    return !!attrs?.properties.some((p) => ts.isJsxAttribute(p) && p.name.getText(sf) === 'data-i18n-ignore');
  };
  const visit = (node: ts.Node, skip: boolean) => {
    const name = elementName(node);
    const here = skip || (name !== null && (SKIP_ELEMENTS.has(name) || hasIgnoreAttr(node)));
    if (!here) {
      if (ts.isJsxText(node) && isTranslatableText(node.text)) push(node, node.text);
      else if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer) && TEXT_ATTRS.has(node.name.getText(sf)) && isTranslatableText(node.initializer.text)) {
        push(node, `${node.name.getText(sf)}="${node.initializer.text}"`);
      } else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !ts.isImportDeclaration(node.parent) && !ts.isExportDeclaration(node.parent) && !(ts.isJsxAttribute(node.parent)) && !ts.isLiteralTypeNode(node.parent) && looksLikeProse(node.text)) {
        // Arguments de t('…') et clés de propriétés : jamais du texte affiché.
        const p = node.parent;
        const isKeyArg = ts.isCallExpression(p) && /(^|\.)t$/.test(p.expression.getText(sf));
        const isPropName = ts.isPropertyAssignment(p) && p.name === node;
        if (!isKeyArg && !isPropName) push(node, node.text);
      } else if (ts.isTemplateExpression(node) && looksLikeProse(node.head.text + node.templateSpans.map((s) => ' ' + s.literal.text).join(''))) {
        push(node, node.getText(sf));
      }
    }
    ts.forEachChild(node, (c) => visit(c, here));
  };
  visit(sf, false);
  return out;
}
