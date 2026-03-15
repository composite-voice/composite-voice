import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3021,
  title: 'OpenAI LLM',
  proxies: { openai: true },
});
