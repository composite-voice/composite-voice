import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3013,
  title: 'ElevenLabsSTT Configuration',
  proxies: {
    elevenlabs: true,
    anthropic: true,
  },
});
