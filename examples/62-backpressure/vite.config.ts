import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3062,
  title: 'Backpressure',
  proxies: {
    deepgram: true,
    anthropic: true,
  },
});
