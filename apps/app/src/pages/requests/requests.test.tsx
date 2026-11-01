import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(async ({ optionsJSON }: { optionsJSON: { challenge: string } }) => ({ id: 'cred', signed: optionsJSON.challenge })),
  startRegistration: vi.fn(),
}));

import { startAuthentication } from '@simplewebauthn/browser';
import { DecisionPanel } from './DecisionPanel';

afterEach(cleanup);

describe('DecisionPanel', () => {
  it('signs the mandate challenge with a passkey then approves', async () => {
    const calls: { path: string; body?: unknown }[] = [];
    const api = vi.fn(async (path: string, opts?: { body?: unknown }) => {
      calls.push({ path, body: opts?.body });
      if (path.endsWith('/approve/options')) return { options: { challenge: 'CHALLENGE-HASH' }, mandate_hash: 'h' };
      return { request: { status: 'issued' } };
    });
    const onDone = vi.fn();
    render(<DecisionPanel api={api as never} requestId="r1" canDecide onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: /Approuver/ }));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: 'CHALLENGE-HASH' } });
    expect(calls.map((c) => c.path)).toEqual(['/app/requests/r1/approve/options', '/app/requests/r1/approve']);
    expect(calls[1]!.body).toEqual({ response: { id: 'cred', signed: 'CHALLENGE-HASH' } });
  });
  it('shows no decision buttons to viewers', () => {
    render(<DecisionPanel api={vi.fn() as never} requestId="r1" canDecide={false} onDone={() => {}} />);
    expect(screen.queryByRole('button', { name: /Approuver/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Refuser/ })).toBeNull();
  });
});
