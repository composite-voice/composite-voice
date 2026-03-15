import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3006,
  proxies: {
    anthropic: true,
  },
});
