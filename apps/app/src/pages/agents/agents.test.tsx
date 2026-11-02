import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PolicyForm } from './PolicyForm';
import { McpConfig } from './McpConfig';
import { withI18n } from '../../testing/i18n';

afterEach(cleanup);

const policy = {
  agent_id: 'a1', monthly_budget_cents: 50000, per_tx_limit_cents: 10000, currencies: ['EUR'], merchant_allow: [], merchant_deny: [],
  mcc_allow: [], mcc_deny: [], auto_approve_below_cents: 0, card_ttl_minutes: 30, request_ttl_minutes: 30, freeze_on_mismatch: false, updated_at: '',
};

describe('PolicyForm', () => {
  it('converts euro inputs to cents', async () => {
    const onSave = vi.fn(async () => undefined);
    render(withI18n(<PolicyForm policy={policy} onSave={onSave} />));
    fireEvent.change(screen.getByLabelText('Per-purchase limit (€)'), { target: { value: '49.90' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect((onSave.mock.calls[0] as unknown as [Record<string, unknown>])[0].per_tx_limit_cents).toBe(4990);
  });
  it('refuses an invalid amount', () => {
    const onSave = vi.fn(async () => undefined);
    render(withI18n(<PolicyForm policy={policy} onSave={onSave} />));
    fireEvent.change(screen.getByLabelText('Monthly budget (€)'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/invalid amount/i)).toBeTruthy();
  });
});

describe('McpConfig', () => {
  it('shows ready-to-paste configurations with the token', () => {
    const { container } = render(withI18n(<McpConfig token="art_test_abcdefghijklmnopqrstuvwxyz" />));
    fireEvent.click(screen.getByRole('button', { name: 'Claude Code' }));
    expect(container.textContent).toContain('claude mcp add --transport http');
    expect(container.textContent).toContain('Authorization: Bearer art_test_abcdefghijklmnopqrstuvwxyz');
    expect(container.textContent).toContain('will not be shown again');
  });
});
