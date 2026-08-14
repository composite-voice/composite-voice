/**
 * Vite config for the guardrails example — dev server on port 3066 with the
 * Deepgram and Anthropic key-holding proxies enabled.
 *
 * @packageDocumentation
 */

import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3066,
  title: 'Guardrails',
  proxies: {
    deepgram: true,
    anthropic: true,
  },
});
