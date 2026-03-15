import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3011,
  title: 'DeepgramSTT Configuration',
  proxies: {
    deepgram: true,
    anthropic: true,
  },
});
