import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3086,
  title: 'Google Meet Listener',
  proxies: {
    speechmatics: true,
    anthropic: true,
  },
});
