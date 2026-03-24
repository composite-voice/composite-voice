/**
 * React island that mounts the voice agent panel in the Astro docs site.
 *
 * Handles session creation, token fetching, and bridges the UI components
 * with the CompositeVoice pipeline. Provides a `search_docs` tool so the
 * agent can query the Pagefind index and give grounded answers.
 */

import { useState, useCallback } from 'react';
import {
  AgentPanel,
  ChatPanel,
  useVoiceAgent,
} from '@lukeocodes/composite-voice-ui/agent';
import type {
  AgentToolDefinition,
  AgentToolCall,
  AgentToolResult,
} from '@lukeocodes/composite-voice-ui/agent';

/* ── Credentials ─────────────────────────────── */

/** Fetch a Deepgram JWT from the serverless endpoint. */
async function getToken(): Promise<{ token: string; expiresIn: number }> {
  const res = await fetch('/docs/api/deepgram-token');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Token request failed: ${res.status}`);
  }
  const data = await res.json();
  return { token: data.token, expiresIn: data.expiresIn };
}

/** Create a session cookie (required before token requests). */
async function ensureSession(): Promise<void> {
  await fetch('/docs/api/session', { method: 'POST' });
}

/* ── Pagefind search tool ────────────────────── */

const SEARCH_TOOL: AgentToolDefinition = {
  name: 'search_docs',
  description:
    'Search the CompositeVoice SDK documentation. Returns relevant page titles, URLs, and excerpts. Use this when the user asks about SDK features, configuration, providers, events, examples, or API reference.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query to find relevant documentation pages',
      },
    },
    required: ['query'],
  },
};

/** Cached Pagefind instance. */
let pagefindInstance: {
  search: (query: string) => Promise<{
    results: Array<{
      data: () => Promise<{
        url: string;
        excerpt: string;
        meta: { title?: string };
        content: string;
      }>;
    }>;
  }>;
} | null = null;

const PAGEFIND_BASE = '/docs';

async function getPagefind() {
  if (pagefindInstance) return pagefindInstance;
  const mod = await import(/* @vite-ignore */ `${PAGEFIND_BASE}/pagefind/pagefind.js`);
  if (mod.init) await mod.init();
  pagefindInstance = mod;
  return mod;
}

async function handleToolCall(toolCall: AgentToolCall): Promise<AgentToolResult> {
  if (toolCall.name === 'search_docs') {
    try {
      const pagefind = await getPagefind();
      const query = String(toolCall.arguments.query ?? '');
      const { results } = await pagefind.search(query);

      // Load data for top 5 results
      const entries = await Promise.all(
        results.slice(0, 5).map(async (r) => {
          const data = await r.data();
          return {
            title: data.meta?.title ?? 'Untitled',
            url: data.url,
            excerpt: data.excerpt.replace(/<\/?mark>/g, ''),
            content: data.content.slice(0, 300),
          };
        }),
      );

      return {
        toolCallId: toolCall.id,
        content: JSON.stringify(entries.length > 0 ? entries : { message: 'No results found' }),
      };
    } catch {
      return {
        toolCallId: toolCall.id,
        content: JSON.stringify({ error: 'Search unavailable — index not built yet' }),
        isError: true,
      };
    }
  }

  return {
    toolCallId: toolCall.id,
    content: JSON.stringify({ error: `Unknown tool: ${toolCall.name}` }),
    isError: true,
  };
}

/* ── Component ───────────────────────────────── */

export default function VoiceAgentIsland() {
  const [isOpen, setIsOpen] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  const [state, actions] = useVoiceAgent({
    getToken,
    anthropicProxyUrl: '/docs/api/proxy/anthropic',
    model: 'claude-haiku-4-5',
    maxTokens: 1024,
    voice: 'aura-2-thalia-en',
    systemPrompt: `You are a helpful voice assistant for the CompositeVoice SDK documentation site.
Answer questions about the SDK concisely and conversationally.
When discussing code, keep examples short and focused.
You can help with: provider setup, configuration, pipeline architecture,
proxy setup, event handling, conversation history, tool use, and custom providers.
You have a search_docs tool — use it to find relevant documentation before answering technical questions.
When you use search results, naturally weave the information into your response.
Respond in plain text for voice — no markdown formatting, no bullet points, no code blocks unless specifically asked for code.`,
    tools: {
      definitions: [SEARCH_TOOL],
      onToolCall: handleToolCall,
    },
  });

  const handleOpen = useCallback(async () => {
    setIsOpen(true);

    if (!sessionReady) {
      await ensureSession();
      setSessionReady(true);
    }

    if (state.status === 'idle') {
      await actions.initialize();
      await actions.startListening();
    }
  }, [sessionReady, state.status, state.messages.length, actions]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    actions.stopListening();
  }, [actions]);

  return (
    <>
      {/* FAB trigger button */}
      {!isOpen && (
        <button
          onClick={handleOpen}
          className="fixed bottom-6 right-6 z-[9998] flex items-center gap-2 rounded-full bg-primary-600 px-4 py-3 text-sm font-medium text-on-filled shadow-lg transition-all hover:bg-primary-500 hover:shadow-xl active:scale-95"
          aria-label="Open voice assistant"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
          Ask AI
        </button>
      )}

      {/* Agent panel */}
      <AgentPanel isOpen={isOpen} onClose={handleClose}>
        <ChatPanel state={state} actions={actions} onClose={handleClose} />
      </AgentPanel>
    </>
  );
}
