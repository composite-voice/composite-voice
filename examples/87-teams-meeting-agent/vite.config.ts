import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3087,
  title: 'Teams Meeting Agent',
  proxies: {
    deepgram: true,
    anthropic: true,
  },
});
