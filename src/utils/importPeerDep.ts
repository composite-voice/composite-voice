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
 * @example
 * ```ts
 * import { importPeerDep } from '../utils/importPeerDep';
 *
 * const Anthropic = await importPeerDep<typeof import('@anthropic-ai/sdk').default>(
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
 * @param packageName - The npm package to import (e.g., `'openai'`)
 * @param providerName - The provider class name for the error message
 * @returns The imported module's default export (or the module itself if no default)
 * @throws {@link ProviderInitializationError} with install instructions if the
 *   package cannot be found, or wraps any other import error.
 */
export async function importPeerDep<T = unknown>(
  packageName: string,
  providerName: string,
): Promise<T> {
  try {
    const mod = await import(packageName);
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
          `${packageName} is required but not installed. Install it with: npm install ${packageName}`
        ),
      );
    }
    throw new ProviderInitializationError(providerName, error as Error);
  }
}
