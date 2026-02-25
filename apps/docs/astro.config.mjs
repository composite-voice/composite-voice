// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: 'CompositeVoice',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/lukeocodes/composite-voice' }],
			components: {
				Header: './src/components/Header.astro',
			},
			sidebar: [
				{
					label: 'Guides',
					items: [
						{ label: 'Example Guide', slug: 'guides/example' },
					],
				},
				{
					label: 'Reference',
					autogenerate: { directory: 'reference' },
				},
			],
		}),
		react(),
	],
	vite: {
		plugins: [tailwindcss()],
	},
});
