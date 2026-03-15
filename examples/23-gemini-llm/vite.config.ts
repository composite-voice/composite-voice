import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3023,
  title: 'Gemini LLM',
  proxies: { gemini: true },
});
