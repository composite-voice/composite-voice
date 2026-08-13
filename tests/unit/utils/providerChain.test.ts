/**
 * Tests for the structural provider-chain guard.
 */

import { isProviderChain, flattenProviderChain } from '../../../src/utils/providerChain';

describe('isProviderChain', () => {
  it('detects a wrapper exposing a non-empty providers array', () => {
    expect(isProviderChain({ providers: [{ name: 'a' }] })).toBe(true);
  });

  it('rejects plain providers, empty chains, and non-objects', () => {
    expect(isProviderChain({ name: 'DeepgramSTT' })).toBe(false);
    expect(isProviderChain({ providers: [] })).toBe(false);
    expect(isProviderChain({ providers: 'not-an-array' })).toBe(false);
    expect(isProviderChain(null)).toBe(false);
    expect(isProviderChain(undefined)).toBe(false);
  });

  it('detects chains structurally, so subclasses and minified names still match', () => {
    // The old class-name check (`constructor.name === 'FallbackSTT'`) missed
    // both of these.
    class FallbackSTT {
      constructor(readonly providers: unknown[]) {}
    }
    class RetryingFallbackSTT extends FallbackSTT {}
    const subclass = new RetryingFallbackSTT([{ name: 'a' }]);
    expect(isProviderChain(subclass)).toBe(true);

    const mangled = { providers: [{ name: 'a' }], constructor: { name: 'x' } };
    expect(isProviderChain(mangled)).toBe(true);
  });
});

describe('flattenProviderChain', () => {
  it('returns a plain provider unchanged', () => {
    const provider = { name: 'DeepgramSTT' };
    expect(flattenProviderChain(provider)).toEqual([provider]);
  });

  it('returns the members of a chain in priority order', () => {
    const a = { name: 'a' };
    const b = { name: 'b' };
    expect(flattenProviderChain({ providers: [a, b] })).toEqual([a, b]);
  });

  it('flattens nested chains down to the leaf providers', () => {
    const a = { name: 'a' };
    const b = { name: 'b' };
    const c = { name: 'c' };
    const nested = { providers: [{ providers: [a, b] }, c] };
    expect(flattenProviderChain(nested)).toEqual([a, b, c]);
  });
});
