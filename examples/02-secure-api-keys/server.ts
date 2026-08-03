import express from 'express';
import { createExpressProxy } from '@lukeocodes/composite-voice/proxy';

const app = express();
const proxy = createExpressProxy({
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  speechmaticsApiKey: process.env.SPEECHMATICS_API_KEY,
  speechifyApiKey: process.env.SPEECHIFY_API_KEY,
  cors: { origins: ['http://localhost:3002'] },
});

app.use(proxy.middleware);

const server = app.listen(3001, () => {
  proxy.attachWebSocket(server);
  console.log('Proxy server running on http://localhost:3001');
});
