import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export interface ExampleConfig {
  port: number;
  title?: string;
  proxies?: {
    deepgram?: boolean;
    anthropic?: boolean;
    openai?: boolean;
    groq?: boolean;
    gemini?: boolean;
    mistral?: boolean;
    elevenlabs?: boolean;
    assemblyai?: boolean;
    cartesia?: boolean;
  };
}

const PROXY_TARGETS: Record<string, { target: string; ws?: boolean; headers?: Record<string, string> }> = {
  deepgram: {
    target: 'wss://api.deepgram.com',
    ws: true,
    headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` },
  },
  anthropic: {
    target: 'https://api.anthropic.com',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
    },
  },
  openai: {
    target: 'https://api.openai.com',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  },
  groq: {
    target: 'https://api.groq.com/openai',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
  },
  gemini: {
    target: 'https://generativelanguage.googleapis.com/v1beta/openai',
    headers: { Authorization: `Bearer ${process.env.GEMINI_API_KEY}` },
  },
  mistral: {
    target: 'https://api.mistral.ai',
    headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` },
  },
  elevenlabs: {
    target: 'wss://api.elevenlabs.io',
    ws: true,
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '' },
  },
  assemblyai: {
    target: 'wss://api.assemblyai.com',
    ws: true,
    headers: { Authorization: process.env.ASSEMBLYAI_API_KEY ?? '' },
  },
  cartesia: {
    target: 'wss://api.cartesia.ai',
    ws: true,
    headers: { 'X-API-Key': process.env.CARTESIA_API_KEY ?? '' },
  },
};

export function createExampleConfig(config: ExampleConfig): UserConfig {
  const proxy: Record<string, any> = {};

  if (config.proxies) {
    for (const [name, enabled] of Object.entries(config.proxies)) {
      if (enabled && PROXY_TARGETS[name]) {
        const target = PROXY_TARGETS[name];
        proxy[`/proxy/${name}`] = {
          target: target.target,
          changeOrigin: true,
          rewrite: (path: string) => path.replace(`/proxy/${name}`, ''),
          ...(target.ws ? { ws: true } : {}),
          headers: target.headers,
        };
      }
    }
  }

  return defineConfig({
    plugins: [react()],
    server: {
      port: config.port,
      strictPort: true,
      proxy,
    },
    resolve: {
      alias: {
        '@lukeocodes/composite-voice': path.resolve(__dirname, '../../dist/index.mjs'),
        '@lukeocodes/composite-voice/proxy': path.resolve(__dirname, '../../dist/proxy/index.mjs'),
      },
    },
    envDir: '../../',
  });
}
