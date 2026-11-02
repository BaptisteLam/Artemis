import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, createDb } from './setup';

const U1 = '11111111-1111-1111-1111-111111111111';
const U2 = '22222222-2222-2222-2222-222222222222';

let db: PGlite;
let org1: string;
let org2: string;
let agent1: string;

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<T>(sql, params);
  return r.rows[0] as T;
}

beforeEach(async () => {
  db = await createDb();
  await db.query(`insert into auth.users(id, email) values ($1,'a@x.fr'),($2,'b@x.fr')`, [U1, U2]);
  org1 = (await one<{ id: string }>(`insert into organizations(name) values ('Org 1') returning id`)).id;
  org2 = (await one<{ id: string }>(`insert into organizations(name) values ('Org 2') returning id`)).id;
  await db.query(`insert into memberships(org_id,user_id,role) values ($1,$2,'owner'),($3,$4,'owner')`, [org1, U1, org2, U2]);
  agent1 = (
    await one<{ id: string }>(
      `insert into agents(org_id,name,platform,token_hash,token_prefix) values ($1,'notion.agent','claude','h1','art_test_abc') returning id`,
      [org1],
    )
  ).id;
  await db.query(`insert into agents(org_id,name,platform,token_hash,token_prefix) values ($1,'other.agent','n8n','h2','art_test_def')`, [org2]);
});

function req(amount: number) {
  return JSON.stringify({ org_id: org1, agent_id: agent1, amount_cents: amount, currency: 'EUR', merchant: 'Notion', purpose: 'test', expires_at: new Date(Date.now() + 1800_000).toISOString(), status: 'pending' });
}

describe('schema', () => {
  it('applies migrations', async () => {
    const r = await db.query<{ n: number }>(`select count(*)::int n from information_schema.tables where table_schema='public'`);
    expect(r.rows[0]!.n).toBeGreaterThanOrEqual(16);
  });

  it('audit_log refuses UPDATE and DELETE', async () => {
    await db.query(`select append_audit($1,'system','cron','test.event','x','{"_canonical":"{}"}'::jsonb)`, [org1]);
    await expect(db.query(`update audit_log set action='x'`)).rejects.toThrow(/append-only/);
    await expect(db.query(`delete from audit_log`)).rejects.toThrow(/append-only/);
  });

  it('chains audit hashes', async () => {
    const a = await one<{ hash: string; prev_hash: string | null }>(`select hash, prev_hash from append_audit($1,'system','cron','a','x','{"_canonical":"{\\"a\\":1}"}'::jsonb)`, [org1]);
    const b = await one<{ hash: string; prev_hash: string | null }>(`select hash, prev_hash from append_audit($1,'system','cron','b','x','{"_canonical":"{\\"b\\":1}"}'::jsonb)`, [org1]);
    expect(a.prev_hash).toBeNull();
    expect(b.prev_hash).toBe(a.hash);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    const other = await one<{ prev_hash: string | null }>(`select prev_hash from append_audit($1,'system','cron','c','x','{"_canonical":"{}"}'::jsonb)`, [org2]);
    expect(other.prev_hash).toBeNull();
  });

  it('create_card_request enforces the monthly budget', async () => {
    const start = new Date(Date.now() - 86400_000).toISOString();
    const r1 = await one<{ status: string }>(`select status from create_card_request($1::jsonb, 5000, $2)`, [req(3000), start]);
    expect(r1.status).toBe('pending');
    await db.query(`update card_requests set status='approved'`);
    await expect(db.query(`select * from create_card_request($1::jsonb, 5000, $2)`, [req(3000), start])).rejects.toThrow(/over_monthly_budget/);
    const ok = await one<{ status: string }>(`select status from create_card_request($1::jsonb, 5000, $2)`, [req(2000), start]);
    expect(ok.status).toBe('pending');
  });

  it('mark_card_revealed only works once', async () => {
    const r = await one<{ id: string }>(`select id from create_card_request($1::jsonb, 100000, now() - interval '1 day')`, [req(1000)]);
    const card = await one<{ id: string }>(`insert into cards(request_id, org_id, provider_card_id, last4, exp_month, exp_year, expires_at) values ($1,$2,'c1','4242',12,2030, now() + interval '30 minutes') returning id`, [r.id, org1]);
    const first = await db.query(`select * from mark_card_revealed($1)`, [card.id]);
    const second = await db.query(`select * from mark_card_revealed($1) where id is not null`, [card.id]);
    expect(first.rows).toHaveLength(1);
    expect(second.rows).toHaveLength(0);
  });

  it('RLS hides other organisations', async () => {
    const seen = await asUser(db, U1, async () => (await db.query<{ name: string }>(`select name from agents`)).rows);
    expect(seen.map((r) => r.name)).toEqual(['notion.agent']);
    const orgs = await asUser(db, U2, async () => (await db.query<{ name: string }>(`select name from organizations`)).rows);
    expect(orgs.map((r) => r.name)).toEqual(['Org 2']);
  });

  it('increment_usage counts per period', async () => {
    await db.query(`select increment_usage($1,'2026-11')`, [org1]);
    const n = await one<{ n: number }>(`select increment_usage($1,'2026-11') as n`, [org1]);
    expect(n.n).toBe(2);
  });

  it('RPC functions are not executable by anon or authenticated', async () => {
    const fns = [
      'append_audit(uuid,text,text,text,text,jsonb)',
      'create_card_request(jsonb,bigint,timestamptz,bigint)',
      'mark_card_revealed(uuid)',
      'increment_usage(uuid,text)',
      'hit_rate_limit(text,integer,integer)',
      'purge_kv()',
    ];
    for (const role of ['anon', 'authenticated']) {
      for (const fn of fns) {
        const r = await db.query<{ ok: boolean }>(`select has_function_privilege($1, $2, 'execute') as ok`, [role, fn]);
        expect(`${role} ${fn} ${r.rows[0]!.ok}`).toBe(`${role} ${fn} false`);
      }
    }
    const svc = await db.query<{ ok: boolean }>(`select has_function_privilege('service_role', 'append_audit(uuid,text,text,text,text,jsonb)', 'execute') as ok`);
    expect(svc.rows[0]!.ok).toBe(true);
    const anonMember = await db.query<{ ok: boolean }>(`select has_function_privilege('anon', 'is_member(uuid,member_role[])', 'execute') as ok`);
    expect(anonMember.rows[0]!.ok).toBe(false);
  });

  it('create_card_request enforces the client budget', async () => {
    const client = (await one<{ id: string }>(`insert into clients(org_id, name, monthly_budget_cents) values ($1, 'Client A', 5000) returning id`, [org1])).id;
    const start = new Date(Date.now() - 86400_000).toISOString();
    const withClient = (amount: number) => JSON.stringify({ ...JSON.parse(req(amount)), client_id: client });
    await db.query(`select * from create_card_request($1::jsonb, 100000, $2, 5000)`, [withClient(3000), start]);
    await expect(db.query(`select * from create_card_request($1::jsonb, 100000, $2, 5000)`, [withClient(3000), start])).rejects.toThrow(/over_client_budget/);
    const ok = await one<{ client_id: string }>(`select client_id from create_card_request($1::jsonb, 100000, $2, 5000)`, [withClient(2000), start]);
    expect(ok.client_id).toBe(client);
  });
});
