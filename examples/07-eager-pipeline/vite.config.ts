import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3007,
  proxies: {
    deepgram: true,
    speechify: true,
    anthropic: true,
  },
});
