import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3004,
  proxies: {
    deepgram: true,
    anthropic: true,
  },
});
