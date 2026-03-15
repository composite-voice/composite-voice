import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3050,
  title: 'Microphone Input Deep-Dive',
  proxies: {
    anthropic: true,
  },
});
