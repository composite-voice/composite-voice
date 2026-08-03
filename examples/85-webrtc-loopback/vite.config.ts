import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3085,
  title: 'WebRTC Loopback Agent',
  proxies: {
    speechmatics: true,
    speechify: true,
    anthropic: true,
  },
});
