import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3066,
  title: 'Guardrails',
  proxies: {
    deepgram: true,
    anthropic: true,
  },
});
