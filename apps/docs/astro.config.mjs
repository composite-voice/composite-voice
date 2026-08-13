// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import robotsTxt from 'astro-robots-txt';
import pagefind from 'astro-pagefind';
import llmsTxt from '@4hse/astro-llms-txt';
import playformInline from '@playform/inline';
import compress from '@playform/compress';
import netlify from '@astrojs/netlify';
import { remarkBaseUrl } from './src/lib/remark-base-url.mjs';
import { remarkBrandName } from './src/lib/remark-brand-name.mjs';

// Node-only optional peer deps. The SDK loads these via importPeerDep with
// literal specifiers, so Vite follows them even though the docs agent never
// constructs DiscordVoice or TeamsCall. Left alone, @discordjs/voice pulls in
// @snazzah/davey's browser entry, which fails to resolve its wasm32-wasi
// binding. Same list as examples/_shared/vite.config.factory.ts.
const NODE_ONLY_PEER_DEPS = [
	'@discordjs/voice',
	'@discordjs/opus',
	'prism-media',
	'ws',
	'@azure/communication-calling',
	'@azure/communication-common',
];

// https://astro.build/config
export default defineConfig({
	output: 'static',
	adapter: netlify(),
	site: process.env.CV_WEB_URL || 'http://localhost:4321',
	base: '/docs',
	markdown: {
		syntaxHighlight: 'prism',
		remarkPlugins: [remarkBrandName, remarkBaseUrl],
	},
	integrations: [
		react(),
		sitemap(),
		robotsTxt(),
		pagefind(),
		llmsTxt({
			title: 'CompositeVoice Documentation',
			description: 'SDK documentation for building composable voice interfaces on the web.',
		}),
		playformInline(),
		compress(),
	],
	vite: {
		plugins: [tailwindcss()],
		resolve: { dedupe: ['react', 'react-dom'] },
		optimizeDeps: {
			exclude: NODE_ONLY_PEER_DEPS,
		},
		ssr: {
			external: NODE_ONLY_PEER_DEPS,
		},
		build: {
			rollupOptions: {
				external: NODE_ONLY_PEER_DEPS,
			},
		},
	},
});
