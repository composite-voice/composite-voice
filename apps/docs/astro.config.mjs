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
		build: {
			rollupOptions: {
				// useVoiceAgent dynamically imports the SDK at runtime in the browser;
				// the SDK isn't installed as a dependency — mark it external so Rollup
				// doesn't try to resolve or bundle it.
				external: ['@lukeocodes/composite-voice'],
			},
		},
	},
});
