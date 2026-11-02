#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { HELP, parseArgs, runInit, runRequest, runStatus, type Config, type Deps } from './commands.js';

const dir = join(homedir(), '.config', 'artemis');
const file = join(dir, 'config.json');

const deps: Deps = {
  log: (s) => console.log(s),
  ask: async (q, def) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const a = await rl.question(`${q}${def ? ` [${def}]` : ''} : `);
    rl.close();
    return a.trim() || def || '';
  },
  fetch: (...a) => fetch(...a),
  writeConfig: async (c: Config) => {
    await mkdir(dir, { recursive: true });
    await writeFile(file, JSON.stringify(c, null, 2));
    await chmod(file, 0o600);
  },
  readConfig: async () => JSON.parse(await readFile(file, 'utf8').catch(() => 'null')) as Config | null,
  hasClaude: () => new Promise((res) => execFile('claude', ['--version'], (err) => res(!err))),
  exec: (cmd, args) => new Promise((res, rej) => execFile(cmd, args, (err) => (err ? rej(err) : res()))),
};

const { command, flags } = parseArgs(process.argv.slice(2));
const str = (k: string) => (typeof flags[k] === 'string' ? (flags[k] as string) : undefined);

try {
  if (command === 'init') await runInit({ api: str('api'), token: str('token'), yes: flags.yes === true, demo: flags.demo === true }, deps);
  else if (command === 'status') await runStatus(deps);
  else if (command === 'request') await runRequest({ amount: str('amount'), merchant: str('merchant'), purpose: str('purpose') }, deps);
  else console.log(HELP);
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exitCode = 1;
}
