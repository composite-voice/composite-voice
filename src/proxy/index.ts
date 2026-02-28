/**
 * @packageDocumentation
 * Server-side proxy middleware for the CompositeVoice SDK.
 *
 * @remarks
 * This module lets browsers reach AI providers that do not support CORS
 * (Deepgram WebSocket, Anthropic, OpenAI, ElevenLabs, AssemblyAI, Groq,
 * Mistral, Gemini, Cartesia) without exposing API keys in the client bundle.
 *
 * It provides framework-specific adapters for Express/Connect, Next.js App Router,
 * and plain Node.js HTTP servers, as well as lower-level core helpers for custom
 * integrations.
 *
 * **Important:** This module uses Node.js built-ins (`http`, `net`, `crypto`) and the
 * optional `ws` peer dependency. It must NEVER be imported from browser code.
 * Always import it from a server-side file only.
 *
 * @example Express / Connect
 * ```typescript
 * import express from 'express';
 * import { createExpressProxy } from '@lukeocodes/composite-voice/proxy';
 *
 * const app = express();
 * const proxy = createExpressProxy({
 *   deepgramApiKey: process.env.DEEPGRAM_API_KEY,
 *   anthropicApiKey: process.env.ANTHROPIC_API_KEY,
 *   openaiApiKey: process.env.OPENAI_API_KEY,
 *   pathPrefix: '/api/proxy',
 * });
 *
 * app.use(proxy.middleware);
 * const server = app.listen(3000, () => proxy.attachWebSocket(server));
 * ```
 *
 * @example Next.js App Router (`app/api/proxy/[...path]/route.ts`)
 * ```typescript
 * import { createNextJsProxy } from '@lukeocodes/composite-voice/proxy';
 *
 * const { GET, POST, PUT, DELETE, PATCH, OPTIONS } = createNextJsProxy({
 *   anthropicApiKey: process.env.ANTHROPIC_API_KEY,
 *   pathPrefix: '/api/proxy',
 * });
 *
 * export { GET, POST, PUT, DELETE, PATCH, OPTIONS };
 * ```
 *
 * @example Plain Node.js
 * ```typescript
 * import http from 'http';
 * import { createNodeProxy } from '@lukeocodes/composite-voice/proxy';
 *
 * const proxy = createNodeProxy({
 *   deepgramApiKey: process.env.DEEPGRAM_API_KEY,
 *   anthropicApiKey: process.env.ANTHROPIC_API_KEY,
 * });
 * const server = http.createServer(proxy.handleRequest);
 * proxy.attachWebSocket(server);
 * server.listen(3000);
 * ```
 *
 * @example Browser-side configuration
 * ```typescript
 * import { CompositeVoice } from '@lukeocodes/composite-voice';
 * import { DeepgramSTT } from '@lukeocodes/composite-voice/providers/stt';
 * import { AnthropicLLM } from '@lukeocodes/composite-voice/providers/llm';
 * import { DeepgramTTS } from '@lukeocodes/composite-voice/providers/tts';
 *
 * const PROXY = 'http://localhost:3000/api/proxy';
 *
 * const voice = new CompositeVoice({
 *   stt: new DeepgramSTT({ proxyUrl: `${PROXY}/deepgram` }),
 *   llm: new AnthropicLLM({ proxyUrl: `${PROXY}/anthropic`, model: 'claude-haiku-4-5' }),
 *   tts: new DeepgramTTS({ proxyUrl: `${PROXY}/deepgram` }),
 * });
 * ```
 */

// Types
export type { CompositeVoiceProxyConfig } from './types';

// Framework adapters
export { createNodeProxy } from './adapters/node';
export type { NodeProxyHandlers } from './adapters/node';

export { createExpressProxy } from './adapters/express';
export type { ExpressProxyHandlers } from './adapters/express';

export { createNextJsProxy } from './adapters/nextjs';

// Core helpers (for custom integrations)
export { forwardHttpRequest } from './core/http';
export { proxyWebSocket } from './core/ws';

// Routing utilities (for custom integrations)
export { buildRoutes } from './utils/routing';
export type { ProxyRoute } from './utils/routing';
