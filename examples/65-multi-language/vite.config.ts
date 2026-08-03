import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3065,
  title: 'Multi-Language',
  proxies: {
    speechmatics: true,
    anthropic: true,
  },
});
