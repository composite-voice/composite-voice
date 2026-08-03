import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3062,
  title: 'Backpressure',
  proxies: {
    speechmatics: true,
    deepgram: true,
    anthropic: true,
  },
});
