/**
 * Structural detection of provider fallback chains.
 *
 * @remarks
 * A "chain" is any provider that wraps an ordered list of interchangeable
 * providers and exposes them as a readonly `providers` array — the shape
 * {@link FallbackSTT} implements. Pipeline utilities need to see through the
 * wrapper: audio-format metadata must reach every member (any of them may
 * end up serving the session), and turn-taking must classify the wrapper by
 * what its members can do.
 *
 * Detection is structural rather than by class name or `instanceof` so that
 * subclasses, future chain wrappers, and minified bundles (where
 * `constructor.name` is mangled) all keep working.
 *
 * @packageDocumentation
 */

/**
 * A provider that wraps an ordered list of interchangeable providers.
 *
 * @typeParam T - The wrapped provider type.
 */
export interface ProviderChain<T> {
  /** The wrapped providers, in priority order. */
  readonly providers: readonly T[];
}

/**
 * Checks whether a provider is a fallback chain wrapping other providers.
 *
 * @remarks
 * Use this instead of comparing `constructor.name` against a name list.
 *
 * @param provider - Any provider instance.
 * @returns `true` when the provider exposes a non-empty `providers` array.
 *
 * @example
 * ```typescript
 * if (isProviderChain<STTProvider>(stt)) {
 *   for (const member of stt.providers) configure(member);
 * }
 * ```
 */
export function isProviderChain<T>(provider: unknown): provider is ProviderChain<T> {
  if (typeof provider !== 'object' || provider === null) return false;
  const members = (provider as { providers?: unknown }).providers;
  return Array.isArray(members) && members.length > 0;
}

/**
 * Returns the chain's members, or the provider itself when it is not a chain.
 *
 * @remarks
 * Chains are flattened recursively, so a chain nested inside another chain
 * still yields the leaf providers that actually own a connection.
 *
 * @param provider - Any provider instance.
 * @returns The leaf providers behind `provider`, in priority order.
 */
export function flattenProviderChain<T>(provider: T): T[] {
  if (!isProviderChain<T>(provider)) return [provider];
  return provider.providers.flatMap((member) => flattenProviderChain(member));
}
