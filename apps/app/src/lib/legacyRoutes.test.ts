import { describe, expect, it } from 'vitest';
import { legacyRedirect } from './legacyRoutes';

describe('legacyRedirect', () => {
  it('maps old French paths to the new English ones', () => {
    expect(legacyRedirect('/demandes/abc')).toBe('/requests/abc');
    expect(legacyRedirect('/facturation', '?statut=annule')).toBe('/billing?status=canceled');
    expect(legacyRedirect('/reglages', '', '#urgence')).toBe('/settings#emergency');
    expect(legacyRedirect('/agents/nouveau')).toBe('/agents/new');
    expect(legacyRedirect('/inconnu')).toBeNull();
  });
});
