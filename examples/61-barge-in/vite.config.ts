import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3061,
  title: 'Barge-In',
  proxies: {
    deepgram: true,
    anthropic: true,
  },
});
