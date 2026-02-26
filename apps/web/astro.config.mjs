// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import robotsTxt from 'astro-robots-txt';
import llmsTxt from '@4hse/astro-llms-txt';
import playformInline from '@playform/inline';
import compress from '@playform/compress';

// https://astro.build/config
export default defineConfig({
	site: process.env.CV_WEB_URL || 'http://localhost:4321',
	integrations: [
		react(),
		sitemap(),
		robotsTxt(),
		llmsTxt({
			title: 'CompositeVoice',
			description: 'An open-source SDK for building composable voice interfaces on the web.',
		}),
		playformInline(),
		compress(),
	],
	vite: {
		plugins: [tailwindcss()],
	},
});
