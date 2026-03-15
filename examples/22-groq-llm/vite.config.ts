import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3022,
  title: 'Groq LLM',
  proxies: { groq: true },
});
