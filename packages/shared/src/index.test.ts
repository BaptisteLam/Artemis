import { describe, expect, it } from 'vitest';
import { VERSION } from './index';

describe('shared', () => {
  it('exposes version', () => {
    expect(VERSION).toBe('0.1.0');
  });
});
