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

// https://astro.build/config
export default defineConfig({
	site: process.env.CV_WEB_URL || 'http://localhost:4321',
	base: process.env.CV_DOCS_BASE || '/',
	markdown: {
		syntaxHighlight: 'prism',
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
	},
});
