import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3055,
  title: 'Conversation History Strategies',
  proxies: {
    anthropic: true,
  },
});
