import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3063,
  title: 'Audio Config Internals',
  proxies: {
    speechmatics: true,
    speechify: true,
    anthropic: true,
  },
});
