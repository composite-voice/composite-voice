/**
 * Shared utility for dynamically importing optional peer dependencies.
 *
 * @packageDocumentation
 *
 * @remarks
 * Many providers in CompositeVoice rely on optional peer dependencies (e.g.,
 * `openai`, `@anthropic-ai/sdk`, `@mlc-ai/web-llm`) that are dynamically
 * imported at initialization time. This module centralizes the try/catch
 * pattern, ensuring consistent error messages with install instructions
 * across all providers.
 *
 * The caller must pass a loader thunk with a **literal** import specifier
 * (`() => import('@msgpack/msgpack')`) rather than having this helper call
 * `import(packageName)` on a variable. Bundlers (Vite, Rollup, webpack) can
 * only resolve dynamic imports they can statically analyze — a variable
 * specifier survives to the browser as a bare-specifier import, which always
 * fails to resolve regardless of whether the package is installed.
 *
 * @example
 * ```ts
 * import { importPeerDep } from '../utils/importPeerDep';
 *
 * const Anthropic = await importPeerDep<typeof import('@anthropic-ai/sdk').default>(
 *   () => import('@anthropic-ai/sdk'),
 *   '@anthropic-ai/sdk',
 *   'AnthropicLLM',
 * );
 * ```
 */

import { ProviderInitializationError } from './errors';

/**
 * Dynamically imports an optional peer dependency, throwing a helpful
 * error if the package is not installed.
 *
 * @param loader - A thunk performing the import with a literal specifier,
 *   e.g. `() => import('@msgpack/msgpack')`, so bundlers can resolve it
 * @param packageName - The npm package name, for the error message (e.g., `'openai'`)
 * @param providerName - The provider class name for the error message
 * @returns The imported module's default export (or the module itself if no default)
 * @throws {@link ProviderInitializationError} with install instructions if the
 *   package cannot be found, or wraps any other import error.
 */
export async function importPeerDep<T = unknown>(
  loader: () => Promise<unknown>,
  packageName: string,
  providerName: string
): Promise<T> {
  try {
    const mod = (await loader()) as { default?: unknown };
    return (mod.default ?? mod) as T;
  } catch (error) {
    if (
      (error as Error)?.message?.includes('Cannot find module') ||
      (error as Error)?.message?.includes('could not resolve') ||
      (error as Error)?.message?.includes('Failed to resolve') ||
      (error as NodeJS.ErrnoException)?.code === 'MODULE_NOT_FOUND'
    ) {
      throw new ProviderInitializationError(
        providerName,
        new Error(
          `${packageName} is required but not installed. Install it with: pnpm add ${packageName}`
        )
      );
    }
    throw new ProviderInitializationError(providerName, error as Error);
  }
}
