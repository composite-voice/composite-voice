import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3054,
  title: 'Advanced Event Inspector',
  proxies: {
    speechmatics: true,
    deepgram: true,
    anthropic: true,
  },
});
