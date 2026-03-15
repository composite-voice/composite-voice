import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3053,
  title: 'Null Output',
  proxies: {
    deepgram: true,
    anthropic: true,
  },
});
