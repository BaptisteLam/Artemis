export interface Config {
  api: string;
  token: string;
}

export interface Deps {
  log: (s: string) => void;
  ask: (question: string, def?: string) => Promise<string>;
  fetch: typeof fetch;
  writeConfig: (c: Config) => Promise<void>;
  readConfig: () => Promise<Config | null>;
  hasClaude: () => Promise<boolean>;
  exec: (cmd: string, args: string[]) => Promise<void>;
}

export const DEFAULT_API = process.env.ARTEMIS_API_URL ?? 'https://api.artemis.workers.dev';
const TOKEN_RE = /^art_(live|test)_[A-Za-z0-9_-]{20,}$/;

export function parseArgs(argv: string[]): { command: string; flags: Record<string, string | true> } {
  const [command = 'help', ...rest] = argv;
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = rest[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else flags[key] = true;
  }
  return { command, flags };
}

export function eurosToCents(input: string): number | null {
  const clean = input.replace(/[\s€]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

async function api<T>(d: Deps, c: Config, path: string, init: RequestInit = {}): Promise<T> {
  const res = await d.fetch(`${c.api}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: { code: string; message: string } };
  if (!res.ok) throw new Error(body.error ? `${body.error.code} : ${body.error.message}` : `Erreur ${res.status}`);
  return body;
}

/** `artemis init` : vérifie le jeton, enregistre la config, branche Claude Code, affiche les autres configs. */
export async function runInit(flags: { api?: string; token?: string; yes?: boolean; demo?: boolean }, d: Deps) {
  d.log('Artemis : branchons votre agent. Le jeton se crée dans l’app (Agents → Nouvel agent).');
  const apiUrl = (flags.api ?? (await d.ask('URL de l’API Artemis', DEFAULT_API))).replace(/\/+$/, '');
  const token = (flags.token ?? (await d.ask('Jeton de l’agent (art_…)'))).trim();
  if (!TOKEN_RE.test(token)) throw new Error('Jeton invalide : il commence par art_test_ ou art_live_.');
  const config = { api: apiUrl, token };
  const me = await api<{ agent: { name: string }; organization: { name: string } }>(d, config, '/v1/me');
  d.log(`✓ Agent ${me.agent.name} (${me.organization.name}) reconnu.`);
  await d.writeConfig(config);
  d.log('✓ Configuration enregistrée (~/.config/artemis/config.json).');

  const mcpUrl = `${apiUrl}/mcp`;
  if (await d.hasClaude()) {
    const ok = flags.yes || /^o|^y/i.test(await d.ask('Ajouter Artemis à Claude Code ? (o/n)', 'o'));
    if (ok) {
      await d.exec('claude', ['mcp', 'add', '--transport', 'http', 'artemis', mcpUrl, '--header', `Authorization: Bearer ${token}`]);
      d.log('✓ Serveur MCP « artemis » ajouté à Claude Code.');
    }
  } else {
    d.log(`Claude Code introuvable. Commande à lancer plus tard :\n  claude mcp add --transport http artemis ${mcpUrl} --header "Authorization: Bearer ${token}"`);
  }
  d.log('\nClaude Desktop (Réglages → Développeur → Modifier la configuration) :');
  d.log(JSON.stringify({ mcpServers: { artemis: { type: 'http', url: mcpUrl, headers: { Authorization: `Bearer ${token}` } } } }, null, 2));
  d.log(`\nn8n : nœud MCP Client, URL ${mcpUrl}, en-tête Authorization: Bearer <jeton>.`);

  if (token.startsWith('art_test_') && (flags.demo || flags.yes)) {
    const r = await api<{ request_id: string; status: string }>(d, config, '/v1/card-requests', {
      method: 'POST',
      body: JSON.stringify({ amount: 100, merchant: 'Artemis Sandbox', purpose: 'premier mandat de test' }),
    });
    d.log(`\n✓ Premier mandat de test créé (${r.status}). Validez-le dans l’app avec votre passkey.`);
  }
  d.log('\nC’est prêt. Demandez à votre agent : « Abonne-nous à Notion pour 49 € avec Artemis ».');
}

async function requireConfig(d: Deps) {
  const c = await d.readConfig();
  if (!c) throw new Error('Pas encore configuré : lancez `npx artemis-agents init`.');
  return c;
}

export async function runStatus(d: Deps) {
  const c = await requireConfig(d);
  const b = await api<{ monthly_budget: number; spent: number; remaining: number; per_transaction_limit: number }>(d, c, '/v1/budgets');
  const e = (x: number) => `${(x / 100).toFixed(2).replace('.', ',')} €`;
  d.log(`Budget du mois : ${e(b.spent)} engagés sur ${e(b.monthly_budget)} (reste ${e(b.remaining)}). Plafond par achat : ${e(b.per_transaction_limit)}.`);
}

export async function runRequest(flags: { amount?: string; merchant?: string; purpose?: string }, d: Deps) {
  const c = await requireConfig(d);
  const cents = eurosToCents(flags.amount ?? (await d.ask('Montant (€)')));
  if (cents === null) throw new Error('Montant invalide (ex. 49,90).');
  const merchant = flags.merchant ?? (await d.ask('Marchand'));
  const purpose = flags.purpose ?? (await d.ask('Objet'));
  const r = await api<{ request_id: string; status: string; reason: string | null }>(d, c, '/v1/card-requests', {
    method: 'POST',
    body: JSON.stringify({ amount: cents, merchant, purpose }),
  });
  d.log(`Demande ${r.request_id} : ${r.status}${r.reason ? ` (${r.reason})` : ''}`);
}

export const HELP = `Artemis — le pare-feu financier de vos agents IA

Usage :
  npx artemis-agents init [--api URL] [--token art_…] [--yes] [--demo]
  npx artemis-agents status
  npx artemis-agents request --amount 49,00 --merchant Notion --purpose "abonnement équipe"
`;
