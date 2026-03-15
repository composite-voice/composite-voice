import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3012,
  title: 'AssemblyAISTT Configuration',
  proxies: {
    assemblyai: true,
    anthropic: true,
  },
});
