import { expect, it } from 'vitest';
import { canonicalJson } from './canonical';

it('sorts keys recursively', () => {
  expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  expect(canonicalJson([{ b: 1, a: null }])).toBe('[{"a":null,"b":1}]');
});
