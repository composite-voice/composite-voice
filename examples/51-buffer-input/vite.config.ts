import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3051,
  title: 'Buffer Input',
  proxies: {
    anthropic: true,
  },
});
