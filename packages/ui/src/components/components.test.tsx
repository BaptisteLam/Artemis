import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Amount, Badge, Logo } from '../index';

afterEach(cleanup);

describe('ui', () => {
  it('Amount renders a true minus', () => {
    const { container } = render(<Amount cents={-4210} />);
    expect(container.textContent).toContain('−42,10');
  });
  it('Amount with sign shows plus and arrow', () => {
    const { container } = render(<Amount cents={2499} sign />);
    expect(container.textContent).toContain('+24,99');
    expect(container.textContent).toContain('↑');
  });
  it('Badge renders its label', () => {
    const { getByText } = render(<Badge tone="pending" label="En attente" />);
    expect(getByText('En attente')).toBeTruthy();
  });
  it('Logo cobalt uses the cobalt token', () => {
    const { container } = render(<Logo variant="cobalt" />);
    expect(container.querySelector('svg')?.getAttribute('fill')).toBe('var(--ar-cobalt)');
  });
  it('tokens.css defines the electric blue canvas', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/tokens.css'), 'utf8');
    expect(css).toContain('--ar-canvas: #0000ff');
  });
});
