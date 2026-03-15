import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3060,
  title: 'Error Recovery',
  proxies: {
    anthropic: true,
  },
});
