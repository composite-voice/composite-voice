import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3024,
  title: 'Mistral LLM',
  proxies: { mistral: true },
});
