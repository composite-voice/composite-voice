import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3008,
  proxies: {
    anthropic: true,
  },
});
