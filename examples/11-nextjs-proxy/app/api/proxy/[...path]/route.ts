import { createNextJsProxy } from '@lukeocodes/composite-voice/proxy';

const { GET, POST, PUT, DELETE, OPTIONS } = createNextJsProxy({
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  pathPrefix: '/api/proxy',
});

export { GET, POST, PUT, DELETE, OPTIONS };
