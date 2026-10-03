import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3035,
  title: 'SpekoTTS Configuration',
  proxies: {
    speko: true,
    anthropic: true,
  },
});
