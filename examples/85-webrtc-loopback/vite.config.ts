import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3085,
  title: 'WebRTC Loopback Agent',
  proxies: {
    deepgram: true,
    anthropic: true,
  },
});
