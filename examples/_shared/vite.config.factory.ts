import { defineConfig, loadEnv, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
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

interface ProxyTarget {
  target: string;
  ws?: boolean;
  headerFn: (env: Record<string, string>) => Record<string, string>;
}

const PROXY_TARGETS: Record<string, ProxyTarget> = {
  deepgram: {
    target: 'wss://api.deepgram.com',
    ws: true,
    headerFn: (env) => ({ Authorization: `Token ${env.DEEPGRAM_API_KEY ?? ''}` }),
  },
  anthropic: {
    target: 'https://api.anthropic.com',
    headerFn: (env) => ({
      'x-api-key': env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
    }),
  },
  openai: {
    target: 'https://api.openai.com',
    headerFn: (env) => ({ Authorization: `Bearer ${env.OPENAI_API_KEY ?? ''}` }),
  },
  groq: {
    target: 'https://api.groq.com/openai',
    headerFn: (env) => ({ Authorization: `Bearer ${env.GROQ_API_KEY ?? ''}` }),
  },
  gemini: {
    target: 'https://generativelanguage.googleapis.com/v1beta/openai',
    headerFn: (env) => ({ Authorization: `Bearer ${env.GEMINI_API_KEY ?? ''}` }),
  },
  mistral: {
    target: 'https://api.mistral.ai',
    headerFn: (env) => ({ Authorization: `Bearer ${env.MISTRAL_API_KEY ?? ''}` }),
  },
  elevenlabs: {
    target: 'wss://api.elevenlabs.io',
    ws: true,
    headerFn: (env) => ({ 'xi-api-key': env.ELEVENLABS_API_KEY ?? '' }),
  },
  assemblyai: {
    target: 'wss://api.assemblyai.com',
    ws: true,
    headerFn: (env) => ({ Authorization: env.ASSEMBLYAI_API_KEY ?? '' }),
  },
  cartesia: {
    target: 'wss://api.cartesia.ai',
    ws: true,
    headerFn: (env) => ({ 'X-API-Key': env.CARTESIA_API_KEY ?? '' }),
  },
};

export function createExampleConfig(config: ExampleConfig): UserConfig {
  const rootDir = path.resolve(__dirname, '../../');

  return defineConfig({
    plugins: [tailwindcss(), react()],
    server: {
      port: config.port,
      strictPort: true,
      proxy: buildProxy(config, rootDir),
    },
    resolve: {
      alias: {
        '@lukeocodes/composite-voice': path.resolve(__dirname, '../../dist/index.mjs'),
        '@lukeocodes/composite-voice/proxy': path.resolve(__dirname, '../../dist/proxy/index.mjs'),
        '@lukeocodes/composite-voice-ui/theme.css': path.resolve(__dirname, '../../packages/ui/src/theme.css'),
        '@lukeocodes/composite-voice-ui/icons': path.resolve(__dirname, '../../packages/ui/src/icons.tsx'),
        '@lukeocodes/composite-voice-ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
      },
    },
    envDir: rootDir,
  });
}

function buildProxy(config: ExampleConfig, rootDir: string): Record<string, any> {
  const env = loadEnv('', rootDir, '');
  const proxy: Record<string, any> = {};

  if (config.proxies) {
    for (const [name, enabled] of Object.entries(config.proxies)) {
      if (enabled && PROXY_TARGETS[name]) {
        const target = PROXY_TARGETS[name];
        proxy[`/proxy/${name}`] = {
          target: target.target,
          changeOrigin: true,
          rewrite: (p: string) => p.replace(`/proxy/${name}`, ''),
          ...(target.ws ? { ws: true } : {}),
          headers: target.headerFn(env),
          configure: (proxy: any) => {
            proxy.on('proxyReq', (proxyReq: any) => {
              // Strip browser headers so upstream sees a server-side request
              proxyReq.removeHeader('origin');
              proxyReq.removeHeader('referer');
              proxyReq.removeHeader('sec-fetch-mode');
              proxyReq.removeHeader('sec-fetch-site');
              proxyReq.removeHeader('sec-fetch-dest');
              proxyReq.removeHeader('sec-ch-ua');
              proxyReq.removeHeader('sec-ch-ua-mobile');
              proxyReq.removeHeader('sec-ch-ua-platform');
            });
          },
        };
      }
    }
  }

  return proxy;
}
