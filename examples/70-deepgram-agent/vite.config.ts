import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3070,
  title: 'Deepgram Agent',
  proxies: {
    deepgramAgent: true,
  },
});
