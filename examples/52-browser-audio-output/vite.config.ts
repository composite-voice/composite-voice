import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3052,
  title: 'Browser Audio Output Deep-Dive',
  proxies: {
    deepgram: true,
    anthropic: true,
  },
});
