import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3015,
  title: 'SpekoSTT Configuration',
  proxies: {
    speko: true,
    anthropic: true,
  },
});
