import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { PayCard } from '../index';

afterEach(cleanup);

describe('PayCard', () => {
  it('shows a masked number with the last four digits, holder and expiry', () => {
    const { container } = render(<PayCard last4="4832" holder="notion.agent" expMonth={12} expYear={2029} />);
    expect(container.querySelector('.ar-paycard-num')?.textContent).toBe('•••• •••• •••• 4832');
    expect(container.textContent).toContain('notion.agent');
    expect(container.textContent).toContain('12/29');
    expect(container.querySelector('.ar-paycard-chip')).toBeTruthy();
  });
  it('is labelled for assistive tech without exposing a full number', () => {
    const { getByRole } = render(<PayCard last4="0005" holder="api.agent" expMonth={1} expYear={2030} />);
    expect(getByRole('img').getAttribute('aria-label')).toBe('Virtual card ending in 0005, holder api.agent, expires 01/30');
  });
  it('stamps used or canceled cards', () => {
    const { container } = render(<PayCard last4="1111" holder="x" expMonth={1} expYear={2030} state="used" />);
    expect(container.querySelector('.ar-paycard-stamp')?.textContent).toBe('Used');
  });
});
