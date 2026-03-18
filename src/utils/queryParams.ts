/**
 * Build URLSearchParams from an options object.
 *
 * Handles all value types automatically:
 * - `string` → single `key=value`
 * - `string[]` → multiple `key=value1&key=value2`
 * - `number` / `boolean` → converted to string
 * - `undefined` → skipped
 *
 * Key names are converted from camelCase to snake_case for the query string.
 */
export function buildQueryParams(
  opts: Record<string, string | string[] | number | boolean | undefined>,
  keyMap?: Record<string, string>,
): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(opts)) {
    if (value === undefined) continue;

    const paramName = keyMap?.[key] ?? camelToSnake(key);

    if (Array.isArray(value)) {
      for (const v of value) {
        params.append(paramName, v);
      }
    } else {
      params.set(paramName, String(value));
    }
  }

  return params;
}

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}
