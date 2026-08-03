/**
 * Next.js App Router catch-all proxy route.
 *
 * Uses createNextJsProxy to forward HTTP requests to provider APIs
 * with credentials injected server-side. The browser never sees the
 * real API keys.
 *
 * Route: /api/proxy/[...path]
 *   - /api/proxy/anthropic/* -> https://api.anthropic.com/*
 *   - /api/proxy/openai/*    -> https://api.openai.com/*
 *   - /api/proxy/speechify/* -> https://api.speechify.ai/*
 *
 * Note: WebSocket proxying (Speechmatics, Deepgram, ElevenLabs, Cartesia)
 * requires a custom Next.js server — the standard Vercel runtime does not
 * support WebSocket upgrades. This example demonstrates HTTP-only proxying,
 * which works on all hosting platforms including Vercel. SpeechifyTTS is a
 * REST provider, so it proxies fine here; SpeechmaticsSTT needs the
 * WebSocket setup in example 42.
 */

import { createNextJsProxy } from '@lukeocodes/composite-voice/proxy';

const { GET, POST, PUT, DELETE, OPTIONS } = createNextJsProxy({
  // Provider API keys — server-side only
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  speechifyApiKey: process.env.SPEECHIFY_API_KEY,

  // Must match the file system route path
  pathPrefix: '/api/proxy',

  // Security configuration (all optional)
  security: {
    // Rate limiting: 60 requests per minute per IP
    rateLimit: {
      maxRequests: 60,
      windowMs: 60_000,
    },

    // Max HTTP body size: 512 KB
    maxBodySize: 524_288,
  },
});

export { GET, POST, PUT, DELETE, OPTIONS };
