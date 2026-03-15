import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3003,
  title: 'Cloud Providers',
  proxies: {
    deepgram: true,
    anthropic: true,
  },
});
