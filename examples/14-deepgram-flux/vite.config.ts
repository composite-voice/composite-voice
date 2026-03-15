import { createExampleConfig } from '../_shared/vite.config.factory';

export default createExampleConfig({
  port: 3014,
  title: 'DeepgramFlux (V2 STT) — Disabled',
  proxies: {
    deepgram: true,
    anthropic: true,
  },
});
