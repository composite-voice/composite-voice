import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3001,
  title: 'First Voice Pipeline',
  proxies: { anthropic: true },
});
