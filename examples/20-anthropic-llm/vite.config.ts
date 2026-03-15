import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3020,
  title: 'Anthropic LLM',
  proxies: { anthropic: true },
});
